import "server-only";

import { z } from "zod";

import { getPickPackShipment } from "./pick-pack.server";
import type { CourierRoute } from "./pick-pack-types";

const routeResponseSchema = z.object({
  routes: z.array(z.object({
    duration: z.string().regex(/^\d+(?:\.\d+)?s$/),
    distanceMeters: z.number().int().nonnegative(),
    polyline: z.object({ encodedPolyline: z.string().min(1) }),
  })).min(1),
});

function durationSeconds(value: string): number {
  return Math.round(Number.parseFloat(value.slice(0, -1)));
}

export async function getCourierRoute(shipmentId: string): Promise<CourierRoute> {
  const shipment = await getPickPackShipment(shipmentId);
  const tracking = shipment.tracking;
  if (!tracking?.location) return { available: false, reason: "Aún no hay una ubicación válida del repartidor." };
  const key = process.env.GOOGLE_MAPS_ROUTES_API_KEY?.trim();
  if (!key) return { available: false, reason: "La ruta estimada no está configurada. La última ubicación sigue disponible." };
  try {
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: tracking.location.latitude, longitude: tracking.location.longitude } } },
        destination: { address: tracking.deliveryAddress },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok) return { available: false, reason: "La ruta estimada no está disponible temporalmente." };
    const parsed = routeResponseSchema.safeParse(await response.json());
    if (!parsed.success) return { available: false, reason: "La ruta estimada no pudo verificarse." };
    const route = parsed.data.routes[0];
    return { available: true, durationSeconds: durationSeconds(route.duration), distanceMeters: route.distanceMeters, encodedPolyline: route.polyline.encodedPolyline };
  } catch {
    return { available: false, reason: "La ruta estimada no está disponible temporalmente." };
  }
}
