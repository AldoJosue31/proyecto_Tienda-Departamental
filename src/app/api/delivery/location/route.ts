import { z } from "zod";
import { deliveryRequest } from "@/lib/logistics/delivery.server";
export const runtime="nodejs";
const schema=z.object({shipmentId:z.string().uuid(),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),recordedAt:z.string().datetime(),source:z.enum(["DEVICE","DEMO"])}).strict();
export async function POST(request:Request) {
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return Response.json({code:"VALIDATION_ERROR",message:"La ubicación requiere envío, coordenadas, fecha y fuente válidos."},{status:400});
  return deliveryRequest("/couriers/$me/location",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(parsed.data)});
}
