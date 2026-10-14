import "server-only";
import { cookies } from "next/headers";
import { gatewayJson } from "@/lib/auth/gateway-client.server";
import { ACCESS_TOKEN_COOKIE, getCurrentUser } from "@/lib/auth/session.server";

export async function deliveryRequest(path:string,init:RequestInit={},staff=false):Promise<Response> {
  const correlationId=crypto.randomUUID();
  try {
    const user=await getCurrentUser();
    if (!user) return Response.json({code:"UNAUTHENTICATED",message:"Inicia sesión para continuar.",correlationId},{status:401});
    if (user.role!=="EMPLOYEE" && !(staff && user.role==="ADMIN")) return Response.json({code:"FORBIDDEN",message:"Esta pantalla requiere una cuenta de empleado.",correlationId},{status:403});
    const token=(await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
    const headers=new Headers(init.headers);headers.set("Authorization",`Bearer ${token}`);headers.set("X-Correlation-Id",correlationId);
    const {body,response}=await gatewayJson<unknown>(path.replace("$me",encodeURIComponent(user.id)),{...init,headers});
    return Response.json(body,{status:response.status,headers:{"Cache-Control":"private, no-store","X-Correlation-Id":correlationId}});
  } catch { return Response.json({code:"DELIVERY_UNAVAILABLE",message:"No pudimos contactar al servicio de reparto. Conservamos la última lectura.",correlationId},{status:503,headers:{"X-Correlation-Id":correlationId}}); }
}
