"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconMapPin, IconPlayerPlay, IconPlayerStop, IconTruckDelivery } from "@tabler/icons-react";
import type { PickPackShipment } from "@/lib/logistics/pick-pack-types";
type AssignedShipment=PickPackShipment & {deliveryAddress:string|null};
type Point={latitude:number;longitude:number;recordedAt:string;source:"DEVICE"|"DEMO"};
async function assigned():Promise<{shipments:AssignedShipment[];refreshedAt:string}> {
  const response=await fetch("/api/delivery/shipments",{cache:"no-store"});const body=await response.json();if (!response.ok) throw new Error(body.message ?? "No se pudieron consultar tus envíos.");return body;
}
export function CourierWorkspace() {
  const list=useQuery({queryKey:["courier-assigned"],queryFn:assigned,refetchInterval:10000});
  const [selectedId,setSelectedId]=useState(""),[streamingId,setStreamingId]=useState(""),[mode,setMode]=useState<"DEVICE"|"DEMO">("DEMO"),[active,setActive]=useState(false);
  const [message,setMessage]=useState("Publicación detenida."),[error,setError]=useState<string|null>(null),[lastAccepted,setLastAccepted]=useState<Point|null>(null),[delivering,setDelivering]=useState(false);
  const latest=useRef<Point|null>(null),busy=useRef(false);
  const selected=list.data?.shipments.find(row=>row.id===selectedId) ?? list.data?.shipments[0];
  useEffect(()=>{
    if (!active || !streamingId) return;
    let disposed=false,watch:number|undefined,step=0,gpsLookupPending=false,gpsRetry:ReturnType<typeof setTimeout>|undefined;const controller=new AbortController();
    const capture=(point:Point)=>{ latest.current=point; };
    const gps=(position:GeolocationPosition)=>{if(disposed)return;if(gpsRetry!==undefined){clearTimeout(gpsRetry);gpsRetry=undefined;}capture({latitude:position.coords.latitude,longitude:position.coords.longitude,recordedAt:new Date(position.timestamp).toISOString(),source:"DEVICE"});};
    const gpsError=(failure:GeolocationPositionError)=>{
      if(disposed)return;
      if(failure.code===1){setActive(false);setError("Permiso GPS denegado. Habilítalo en el navegador o utiliza Demostración universitaria.");setMessage("Publicación detenida.");return;}
      setError("El GPS perdió la señal temporalmente. Esperamos una posición nueva; puedes detener la publicación o usar Demostración universitaria.");
      setMessage(navigator.onLine ? "Esperando una nueva señal GPS. Se reintentará automáticamente." : "Sin red. Publicación pausada hasta recuperar conexión.");
      if(gpsRetry===undefined && !gpsLookupPending)gpsRetry=setTimeout(()=>{gpsRetry=undefined;requestGps();},5000);
    };
    const requestGps=()=>{
      if(disposed || gpsLookupPending || !navigator.onLine)return;gpsLookupPending=true;
      navigator.geolocation.getCurrentPosition(position=>{gpsLookupPending=false;gps(position);},failure=>{gpsLookupPending=false;gpsError(failure);},{enableHighAccuracy:true,maximumAge:0,timeout:12000});
    };
    if (mode==="DEVICE") watch=navigator.geolocation.watchPosition(gps,gpsError,{enableHighAccuracy:true,maximumAge:0,timeout:12000});
    const demo=setInterval(()=>{if(mode!=="DEMO")return;step=(step+1)%20;capture({latitude:19.428+step*0.00015,longitude:-99.139+step*0.0001,recordedAt:new Date().toISOString(),source:"DEMO"});},2000);
    const send=setInterval(()=>{
      const point=latest.current;if(!point || busy.current || !navigator.onLine)return;
      latest.current=null;if(Date.now()-Date.parse(point.recordedAt)>30000)return;busy.current=true;
      void fetch("/api/delivery/location",{method:"POST",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]),headers:{"Content-Type":"application/json"},body:JSON.stringify({...point,shipmentId:streamingId})}).then(async response=>{
        const body=await response.json();if(disposed)return;
        if(!response.ok){setError(body.message ?? "No se pudo publicar la ubicación.");setMessage("Esperando recuperación del servicio; publicación sin confirmar.");if([400,401,403,409,422].includes(response.status)){setActive(false);setMessage("Publicación detenida; revisa sesión y asignación.");}return;}
        setLastAccepted(point);setError(null);setMessage(mode==="DEMO" ? "Publicando ubicaciones ficticias de demostración." : "Publicando GPS del navegador.");
      }).catch(()=>{if(!disposed){setError("Sin conexión con reparto. Conservamos solo la posición más reciente, sin acumular un historial pendiente.");}}).finally(()=>{busy.current=false;});
    },5000);
    const offline=()=>{latest.current=null;setMessage("Sin red. Publicación pausada hasta recuperar conexión.");};
    const online=()=>{latest.current=null;setMessage("Conexión recuperada. Esperando una posición nueva.");if(mode==="DEVICE")requestGps();};
    const hidden=()=>{if(document.hidden){setActive(false);setMessage("Se detuvo al ocultar la pantalla. Vuelve a iniciar cuando estés listo.");}};
    window.addEventListener("offline",offline);window.addEventListener("online",online);document.addEventListener("visibilitychange",hidden);
    return ()=>{disposed=true;controller.abort();latest.current=null;clearInterval(demo);clearInterval(send);if(gpsRetry!==undefined)clearTimeout(gpsRetry);if(watch!==undefined)navigator.geolocation.clearWatch(watch);window.removeEventListener("offline",offline);window.removeEventListener("online",online);document.removeEventListener("visibilitychange",hidden);};
  },[active,streamingId,mode]);
  function start() {
    if(!selected || selected.status!=="SHIPPED")return;
    if(mode==="DEVICE" && (!window.isSecureContext || !navigator.geolocation)){setError("GPS requiere un contexto seguro. Usa localhost o HTTPS; el modo universitario está disponible sin GPS.");return;}
    latest.current=null;setStreamingId(selected.id);setError(null);setMessage(mode==="DEMO" ? "Iniciando recorrido ficticio…" : "Solicitando permiso GPS…");setActive(true);
  }
  function stop() {setActive(false);latest.current=null;setMessage("Publicación detenida. La última ubicación permanece como referencia.");}
  async function delivered() {
    if(!selected || !window.confirm("¿Confirmas que entregaste este paquete al cliente?"))return;
    stop();setDelivering(true);setError(null);
    try {const response=await fetch(`/api/operations/shipments/${selected.id}/status`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"DELIVERED",version:selected.version})});const body=await response.json();if(!response.ok)throw new Error(body.message ?? "No se pudo confirmar la entrega.");setMessage("Entrega confirmada. El cliente puede consultar su estado actualizado.");await list.refetch();}
    catch(failure){setError(failure instanceof Error ? failure.message : "No se pudo confirmar la entrega.");await list.refetch();}finally{setDelivering(false);}
  }
  return <section className="mx-auto max-w-3xl" aria-labelledby="delivery-title"><header><p className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]"><IconTruckDelivery size={18} aria-hidden="true"/>Mi reparto</p><h1 id="delivery-title" className="mt-2 text-3xl font-semibold tracking-tight">Tus entregas, paso a paso.</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Solo aparecen envíos asignados a tu cuenta. La ubicación acompaña el recorrido; confirmar la entrega siempre requiere tu acción.</p></header>
    {list.isPending ? <p role="status" className="mt-6">Consultando envíos…</p> : list.error ? <div role="alert" className="mt-6 rounded-xl bg-[var(--warning-surface)] p-4"><p>{list.error.message}</p><button className="mt-3 min-h-11 font-semibold underline" onClick={()=>void list.refetch()}>Reintentar envíos</button></div> : !selected ? <div className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6"><h2 className="font-semibold">No tienes entregas activas</h2><p className="mt-2 text-sm text-[var(--muted)]">Desde Operación, asigna un envío a esta cuenta y pásalo a Enviado. Esta pantalla se actualiza automáticamente.</p></div> : <div className="mt-8 space-y-5">
      <label className="grid gap-2 text-sm font-semibold">Envío asignado<select className="min-h-12 w-full min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3" value={selected.id} disabled={active || delivering} onChange={event=>{setSelectedId(event.target.value);setLastAccepted(null);}}>{list.data?.shipments.map(row=><option key={row.id} value={row.id}>Pedido {row.orderId.slice(0,8)} · {row.status==="SHIPPED" ? "Enviado" : "Empacando"}</option>)}</select></label>
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="flex items-center gap-2 font-semibold"><IconMapPin size={18} aria-hidden="true"/>Destino</h2><p className="mt-2 text-sm leading-6">{selected.deliveryAddress ?? "Falta dirección de entrega."}</p><ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">{selected.items.map(item=><li key={item.variantId}>{item.productName} · {item.variantLabel} × {item.quantity}</li>)}</ul></section>
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="font-semibold">Publicar ubicación</h2><label className="mt-4 grid gap-2 text-sm">Origen de la posición<select aria-label="Origen de ubicación" className="min-h-12 w-full min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3" value={mode} disabled={active} onChange={event=>{setMode(event.target.value as "DEVICE"|"DEMO");setLastAccepted(null);}}><option value="DEMO">Demostración universitaria · ubicación ficticia</option><option value="DEVICE">GPS del navegador · solicita permiso</option></select></label><p className="mt-3 text-xs leading-5 text-[var(--muted)]">{mode==="DEMO" ? "Se recorre una secuencia ficticia en CDMX. No corresponde a tu ubicación ni calcula tráfico." : "Comparte posiciones mientras esta pantalla permanezca visible. Puedes detenerlas en cualquier momento."}</p>
      <div className="mt-5 flex gap-3"><button onClick={start} disabled={active || selected.status!=="SHIPPED"} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-50"><IconPlayerPlay size={18} aria-hidden="true"/>Iniciar publicación</button><button onClick={stop} disabled={!active} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--surface-muted)] px-4 text-sm font-semibold disabled:opacity-50"><IconPlayerStop size={18} aria-hidden="true"/>Detener</button></div><p role="status" className="mt-4 text-sm">{message}</p>{lastAccepted ? <p className="mt-2 text-xs tabular-nums text-[var(--muted)]">Última posición aceptada: {new Date(lastAccepted.recordedAt).toLocaleTimeString("es-MX")} · {lastAccepted.source==="DEMO" ? "Ficticia" : "GPS"}</p> : null}{selected.status!=="SHIPPED" ? <p className="mt-3 text-sm text-[var(--warning)]">El pedido sigue empacándose. Puedes publicar cuando Operación lo marque Enviado.</p> : null}</section>
      {error ? <p role="alert" className="rounded-xl bg-[var(--warning-surface)] p-4 text-sm">{error}</p> : null}
      <button onClick={()=>void delivered()} disabled={delivering || selected.status!=="SHIPPED"} className="min-h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 font-semibold disabled:opacity-50">{delivering ? "Confirmando entrega…" : "Confirmar paquete entregado"}</button>
    </div>}
  </section>;
}
