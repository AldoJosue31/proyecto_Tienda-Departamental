"use client";

import { IconMapPin, IconRoute, IconSatellite, IconTruckDelivery, IconWifi, IconWifiOff } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { useEffect, useRef, useState } from "react";
import { sileo } from "sileo";

import type { CourierRoute, CourierTrackingUpdate, PickPackShipment, PickPackShipmentDetail, PickPackTracking } from "@/lib/logistics/pick-pack-types";

type MapConfig = { browserKey: string | null; mapId: string | null; gatewayUrl: string };
type Position = { lat: number; lng: number };
type MapInstance = { fitBounds(bounds: { extend(position: Position): void }, padding?: number): void };
type MapsLibrary = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Polyline: new (options: { map: MapInstance; path: Position[]; strokeColor: string; strokeOpacity: number; strokeWeight: number }) => unknown;
};
type CoreLibrary = { LatLngBounds: new () => { extend(position: Position): void } };
type MarkerLibrary = { AdvancedMarkerElement: new (options: { map: MapInstance; position: Position; title: string }) => {map:MapInstance|null} };
type GeometryLibrary = { encoding: { decodePath(encoded: string): Array<{ lat(): number; lng(): number }> } };
type MapsNamespace = { maps: { importLibrary(name: string): Promise<unknown> } };
type MapsWindow = Window & { google?: MapsNamespace; __departamentalGoogleMapsLoaded?: () => void; gm_authFailure?:()=>void };



async function routeEstimate(shipmentId: string): Promise<CourierRoute> {
  const response = await fetch(`/api/operations/shipments/${encodeURIComponent(shipmentId)}/route-estimate`, { cache: "no-store" });
  const body = await response.json().catch(() => null) as CourierRoute & { message?: string } | null;
  if (!response.ok) throw new Error(body?.message ?? "No se pudo consultar la ruta estimada.");
  return body ?? { available: false, reason: "La ruta no está disponible." };
}

async function updateTracking(shipmentId: string, input: { courierId: string; courierName: string; deliveryAddress: string; version: number }): Promise<PickPackShipmentDetail> {
  const response = await fetch(`/api/operations/shipments/${encodeURIComponent(shipmentId)}/tracking`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => null) as PickPackShipmentDetail & { message?: string } | null;
  if (!response.ok || !body) throw new Error(body?.message ?? "No se pudo configurar el seguimiento.");
  return body;
}

function getMaps(): MapsNamespace | null {
  return (window as MapsWindow).google ?? null;
}

function loadMaps(browserKey: string): Promise<MapsNamespace> {
  const current = getMaps();
  if (current) return Promise.resolve(current);
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(()=>reject(new Error("Google Maps no respondió.")),12000);
    const existing = document.getElementById("departamental-google-maps") as HTMLScriptElement | null;
    const finish = () => {
      clearTimeout(deadline);
      const loaded = getMaps();
      if (loaded) resolve(loaded);
      else reject(new Error("Google Maps no se pudo cargar."));
    };
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps no se pudo cargar.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    const mapsWindow = window as MapsWindow;
    mapsWindow.gm_authFailure = () => window.dispatchEvent(new Event("departamental.maps.auth-failure"));
    const callback = "__departamentalGoogleMapsLoaded";
    script.id = "departamental-google-maps";
    script.async = true;
    mapsWindow[callback] = () => {
      delete mapsWindow[callback];
      finish();
    };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(browserKey)}&v=weekly&loading=async&callback=${callback}`;
    script.addEventListener("error", () => {
      delete mapsWindow[callback];
      reject(new Error("Google Maps no se pudo cargar."));
    }, { once: true });
    document.head.appendChild(script);
  });
}

function locationLabel(freshness: PickPackTracking["locationFreshness"]): string {
  return freshness === "RECENT" ? "Ubicación reciente" : freshness === "STALE" ? "Ubicación anterior" : "Sin ubicación";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDistance(value: number | undefined): string | null {
  if (value === undefined) return null;
  return value >= 1_000 ? `${(value / 1_000).toFixed(1)} km` : `${value} m`;
}

function formatDuration(value: number | undefined): string | null {
  if (value === undefined) return null;
  const minutes = Math.max(1, Math.round(value / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

function CourierMap({ tracking, route, maps }: { tracking: PickPackTracking; route: CourierRoute | undefined; maps: MapConfig }) {
  const node = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const location = tracking.location;

  useEffect(() => {
    if (!node.current || !location || !maps.browserKey || !maps.mapId) return;
    let active = true;
    const authFailure = ()=>setError("Google Maps rechazó la configuración. Conservamos la dirección y la última ubicación.");
    window.addEventListener("departamental.maps.auth-failure",authFailure);
    const markers:Array<{map:MapInstance|null}> = [];
    let polyline:{setMap(map:MapInstance|null):void}|null = null;
    void (async () => {
      try {
        const namespace = await loadMaps(maps.browserKey ?? "");
        const [mapsLibrary,coreLibrary,markerLibrary,geometryLibrary] = await Promise.all([
          namespace.maps.importLibrary("maps") as Promise<MapsLibrary>,
          namespace.maps.importLibrary("core") as Promise<CoreLibrary>,
          namespace.maps.importLibrary("marker") as Promise<MarkerLibrary>,
          namespace.maps.importLibrary("geometry") as Promise<GeometryLibrary>,
        ]);
        if (!active || !node.current) return;
        const position = { lat: location.latitude, lng: location.longitude };
        const map = new mapsLibrary.Map(node.current, { center: position, zoom: 14, mapId: maps.mapId, disableDefaultUI: true, gestureHandling: "cooperative" });
        markers.push(new markerLibrary.AdvancedMarkerElement({ map, position, title: `Repartidor ${tracking.courier.name}` }));
        const bounds = new coreLibrary.LatLngBounds();
        bounds.extend(position);
        if (route?.available && route.encodedPolyline) {
          const path = geometryLibrary.encoding.decodePath(route.encodedPolyline).map((point) => ({ lat: point.lat(), lng: point.lng() }));
          polyline = new mapsLibrary.Polyline({ map, path, strokeColor: "#2742c7", strokeOpacity: 0.88, strokeWeight: 5 }) as {setMap(map:MapInstance|null):void};
          path.forEach((point) => bounds.extend(point));
          if (route.destination) {
            const destination = {lat:route.destination.latitude,lng:route.destination.longitude};
            markers.push(new markerLibrary.AdvancedMarkerElement({map,position:destination,title:"Destino: "+tracking.deliveryAddress}));
            bounds.extend(destination);
          }
        }
        map.fitBounds(bounds, 34);
      } catch {
        if (active) setError("El mapa no está disponible. Conservamos la dirección y la última ubicación.");
      }
    })();
    return () => { active = false; window.removeEventListener("departamental.maps.auth-failure",authFailure); markers.forEach(marker=>{marker.map=null;}); polyline?.setMap(null); };
  }, [location, maps.browserKey, maps.mapId, route?.available, route?.encodedPolyline,route?.destination, tracking.courier.name,tracking.deliveryAddress]);

  if (!location) return null;
  if (!maps.browserKey || !maps.mapId) return <MapFallback message="Google Maps no está configurado. Conservamos la dirección y la última ubicación." />;
  if (error) return <MapFallback message={error} />;
  return <div ref={node} className="mt-4 h-56 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-muted)]" aria-label="Mapa de seguimiento del repartidor" role="img" />;
}

function MapFallback({ message }: { message: string }) {
  return <p className="mt-4 rounded-xl bg-[var(--surface-muted)] px-3 py-3 text-sm leading-6 text-[var(--muted)]">{message}</p>;
}

export function ShipmentTrackingPanel({ shipment, tracking, maps, onUpdated }: { shipment: PickPackShipment; tracking?: PickPackTracking; maps: MapConfig; onUpdated: (detail: PickPackShipmentDetail) => void }) {
  const [liveLocation, setLiveLocation] = useState<{ courierId: string; location: CourierTrackingUpdate["location"] } | null>(null);
  const [clockAt,setClockAt] = useState(()=>Date.now());
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();
  useEffect(()=>{const timer=setInterval(()=>setClockAt(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const latestLocation = tracking && liveLocation?.courierId === tracking.courier.id && Date.parse(liveLocation.location.recordedAt)>Date.parse(tracking.location?.recordedAt ?? "1970-01-01") ? liveLocation.location : tracking?.location;
  const current:PickPackTracking|undefined = tracking ? {...tracking,location:latestLocation ?? null,locationFreshness:latestLocation ? (clockAt-Date.parse(latestLocation.recordedAt)>300000 ? "STALE" : "RECENT") : "UNAVAILABLE"} : undefined;
  const route = useQuery({
    queryKey: ["courier-route", shipment.id, current?.location?.recordedAt],
    queryFn: () => routeEstimate(shipment.id),
    enabled: Boolean(current?.location),
    staleTime: 30_000,
  });

  useEffect(() => {
    const socket: Socket = io(maps.gatewayUrl, { path: "/realtime/socket.io", transports: ["websocket", "polling"], withCredentials: true });
    const applyLocation = (event: CourierTrackingUpdate) => {
      if (event.shipmentId !== shipment.id || event.courierId !== tracking?.courier.id) return;
      setLiveLocation(previous => !previous || Date.parse(event.location.recordedAt)>Date.parse(previous.location.recordedAt) ? { courierId: event.courierId, location: event.location } : previous);
      void queryClient.invalidateQueries({ queryKey: ["courier-route", shipment.id] });
    };
    socket.on("courier.location.updated", applyLocation);
    return () => { socket.off("courier.location.updated", applyLocation); socket.disconnect(); };
  }, [queryClient, shipment.id, tracking?.courier.id, maps.gatewayUrl]);

  const onSubmit = async (form: HTMLFormElement) => {
    const values = new FormData(form);
    setIsSaving(true);
    try {
      const detail = await updateTracking(shipment.id, {
        courierId: String(values.get("courierId") ?? ""),
        courierName: String(values.get("courierName") ?? ""),
        deliveryAddress: String(values.get("deliveryAddress") ?? ""),
        version: shipment.version,
      });
      onUpdated(detail);
      sileo.success({ title: "Seguimiento configurado", description: "El envío ya puede recibir ubicaciones del repartidor." });
      form.closest("details")?.removeAttribute("open");
    } catch (error) {
      sileo.error({ title: "No se pudo configurar", description: error instanceof Error ? error.message : "Verifica los datos e inténtalo de nuevo." });
    } finally {
      setIsSaving(false);
    }
  };

  const routeDuration = formatDuration(route.data?.durationSeconds);
  const routeDistance = formatDistance(route.data?.distanceMeters);
  const freshnessTone = current?.locationFreshness === "RECENT" ? "bg-[var(--success-surface)] text-[var(--success)]" : current?.locationFreshness === "STALE" ? "bg-[var(--warning-surface)] text-[var(--warning)]" : "bg-[var(--surface-muted)] text-[var(--muted)]";

  return <section className="mt-6 border-t border-[var(--line)] pt-6" aria-labelledby="shipment-tracking-title">
    <div className="flex items-start justify-between gap-4"><div><h3 id="shipment-tracking-title" className="flex items-center gap-2 text-sm font-semibold"><IconSatellite size={17} className="text-[var(--accent)]" aria-hidden="true" />Seguimiento de entrega</h3><p className="mt-1 text-sm leading-6 text-[var(--muted)]">La ubicación complementa el estado del envío; no lo sustituye.</p></div>{current?.location ? <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${freshnessTone}`}>{current.locationFreshness === "RECENT" ? <IconWifi size={14} aria-hidden="true" /> : <IconWifiOff size={14} aria-hidden="true" />}{locationLabel(current.locationFreshness)}</span> : null}</div>
    {current ? <>
      <dl className="mt-4 grid gap-3 rounded-xl bg-[var(--surface-muted)] p-4 sm:grid-cols-2"><Data label="Repartidor" value={current.courier.name} /><Data label="Destino" value={current.deliveryAddress} /><Data label="Última señal" value={current.location ? formatDate(current.location.recordedAt) : "Aún sin señal"} /><Data label="Ruta estimada" value={route.isLoading ? "Calculando" : routeDuration && routeDistance ? `${routeDuration} · ${routeDistance}` : route.data?.reason ?? "Aún no disponible"} /></dl>
      <CourierMap tracking={current} route={route.data} maps={maps} />
      {current.location ? <p className="mt-3 flex items-center gap-2 text-xs leading-5 text-[var(--muted)]"><IconMapPin size={15} aria-hidden="true" />{current.location.latitude.toFixed(5)}, {current.location.longitude.toFixed(5)} · registrada {formatDate(current.location.recordedAt)}</p> : <p className="mt-3 flex items-center gap-2 text-sm leading-6 text-[var(--muted)]"><IconTruckDelivery size={17} aria-hidden="true" />Esperando la primera señal del repartidor.</p>}
    </> : <p className="mt-4 rounded-xl bg-[var(--surface-muted)] px-4 py-3 text-sm leading-6 text-[var(--muted)]">Asigna repartidor y dirección antes de iniciar el seguimiento de este envío.</p>}
    <details className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4" open={!current}>
      <summary className="cursor-pointer list-none text-sm font-semibold marker:hidden"><span className="flex items-center justify-between gap-3"><span className="flex items-center gap-2"><IconRoute size={17} className="text-[var(--accent)]" aria-hidden="true" />{current ? "Editar asignación de reparto" : "Configurar reparto"}</span><span className="text-xs font-medium text-[var(--muted)]">Dirección y repartidor</span></span></summary>
      <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); void onSubmit(event.currentTarget); }}>
        <label className="grid gap-1.5 text-sm font-medium"><span>Nombre del repartidor</span><input name="courierName" defaultValue={current?.courier.name} required maxLength={120} className="min-h-11 rounded-xl border bg-[var(--surface)] px-3 text-sm" /></label>
        <label className="grid gap-1.5 text-sm font-medium"><span>ID del repartidor</span><input name="courierId" defaultValue={current?.courier.id} required pattern="[0-9a-fA-F-]{36}" placeholder="UUID de la app de reparto" className="min-h-11 rounded-xl border bg-[var(--surface)] px-3 font-mono text-sm" /></label>
        <label className="grid gap-1.5 text-sm font-medium"><span>Dirección de entrega</span><textarea name="deliveryAddress" defaultValue={current?.deliveryAddress} required maxLength={500} rows={3} className="rounded-xl border bg-[var(--surface)] px-3 py-2 text-sm leading-6" /></label>
        <button type="submit" disabled={isSaving} className="mt-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55">{isSaving ? "Guardando seguimiento" : "Guardar asignación"}</button>
      </form>
    </details>
  </section>;
}

function Data({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium text-[var(--muted)]">{label}</dt><dd className="mt-1 text-sm font-medium leading-5">{value}</dd></div>;
}
