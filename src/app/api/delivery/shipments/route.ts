import { deliveryRequest } from "@/lib/logistics/delivery.server";
export const runtime="nodejs";
export function GET() { return deliveryRequest("/couriers/me/shipments"); }
