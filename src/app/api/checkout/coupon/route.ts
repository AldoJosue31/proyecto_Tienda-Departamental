import { cookies } from "next/headers";
import { z } from "zod";
import { ACCESS_TOKEN_COOKIE,getCurrentUser } from "@/lib/auth/session.server";
import { gatewayJson,GatewayRequestError } from "@/lib/auth/gateway-client.server";
import type { CatalogProductDetail } from "@/lib/catalog/types";

export const runtime = "nodejs";
const schema=z.object({code:z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,63}$/),items:z.array(z.object({productId:z.string().uuid(),variantId:z.string().uuid(),quantity:z.number().int().min(1).max(1000000)})).min(1).max(20)});
export async function POST(request:Request) {
  const correlationId=crypto.randomUUID();
  try {
    const user=await getCurrentUser();
    if (!user) return Response.json({message:"Debes iniciar sesión."},{status:401});
    if (user.role!=="CUSTOMER") return Response.json({message:"El cupón se valida desde una cuenta de cliente."},{status:403});
    const parsed=schema.safeParse(await request.json().catch(()=>null));
    if (!parsed.success) return Response.json({message:"Revisa el código y los artículos."},{status:400});
    const token=(await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
    const lines=await Promise.all(parsed.data.items.map(async item=>{
      const result=await gatewayJson<{product:CatalogProductDetail}>("/products/"+item.productId,{headers:{Authorization:`Bearer ${token}`}});
      const product=result.body.product;
      const variant=product?.variants.find(candidate=>candidate.id===item.variantId);
      if (!variant) throw new Error("Artículo no disponible.");
      return {productId:product.id,variantId:variant.id,categoryId:product.category.id,basePrice:variant.listPrice,currency:variant.currency,quantity:item.quantity};
    }));
    const {body,response}=await gatewayJson<unknown>("/pricing/coupons/quote",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({code:parsed.data.code,lines})});
    return Response.json(body,{status:response.status,headers:{"Cache-Control":"private, no-store"}});
  } catch (error) {
    if (error instanceof GatewayRequestError) return Response.json({message:error.message,correlationId:error.correlationId},{status:error.status});
    return Response.json({message:"No fue posible verificar el cupón.",correlationId},{status:503});
  }
}
