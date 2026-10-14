import { Injectable } from "@nestjs/common";
import { ApiException } from "../common/api-exception";

export type DirectoryCustomer={id:string;name:string;createdAt:string};
export type CustomerActivity={customerId:string;firstPurchaseAt:string|null;lastPurchaseAt:string|null;completedOrders:number;lifetimeTotal:number;currency:string};
export type AuthoritativeOrder={id:string;branchId:string;currency:string;total:number;subtotal:number;discountTotal:number;couponCode:string|null;completedAt:string;items:Array<{productId:string;variantId:string;productName:string;sku:string;variantLabel:string;quantity:number;lineTotal:number;listUnitPrice:number;unitPrice:number;lineDiscountTotal:number}>};
@Injectable()
export class CrmAuthorityService {
  private async directory<T>(path:string):Promise<T> {
    try {
      const response=await fetch(`${process.env.AUTH_SERVICE_URL ?? "http://servicio-autenticacion:3001"}/internal/directory${path}`,{headers:{"x-directory-service":"crm","x-internal-service-key":process.env.CRM_IDENTITY_DIRECTORY_KEY ?? ""},signal:AbortSignal.timeout(10000)});
      if(response.status===404)throw new ApiException(404,"CUSTOMER_NOT_AVAILABLE","El cliente no está habilitado.");
      if (!response.ok) throw new Error("Directory unavailable"); return await response.json() as T;
    } catch(error) {if(error instanceof ApiException)throw error;throw new ApiException(503,"IDENTITY_DIRECTORY_UNAVAILABLE","No pudimos verificar las identidades de clientes. Intenta de nuevo."); }
  }
  private async orders<T>(path:string,ids:string[]):Promise<T> {
    try {
      const response=await fetch(`${process.env.ORDERS_SERVICE_URL ?? "http://servicio-pedidos:3005"}/internal/reports/${path}`,{method:"POST",headers:{"Content-Type":"application/json","x-report-service":"crm","x-internal-service-key":process.env.CRM_ORDERS_REPORT_KEY ?? ""},body:JSON.stringify({ids}),signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error("Orders unavailable");return await response.json() as T;
    } catch { throw new ApiException(503,"PURCHASE_ACTIVITY_UNAVAILABLE","No pudimos verificar las compras oficiales. No se enviará una campaña con datos atrasados."); }
  }
  async snapshot():Promise<{referenceAt:string;users:DirectoryCustomer[];customers:CustomerActivity[]}> {
    const directory=await this.directory<{users:DirectoryCustomer[];complete:boolean}>("");
    if (!directory.complete) throw new ApiException(503,"DIRECTORY_LIMIT","El directorio excede el límite de 1000 clientes de esta versión; no se enviará un segmento parcial.");
    if (!directory.users.length) return {referenceAt:new Date().toISOString(),users:[],customers:[]};
    const activity=await this.orders<{referenceAt:string;customers:CustomerActivity[]}>("customer-activity",directory.users.map(user=>user.id));
    if (activity.customers.length!==directory.users.length || new Set(activity.customers.map(customer=>customer.customerId)).size!==directory.users.length || activity.customers.some(customer=>!directory.users.some(user=>user.id===customer.customerId))) throw new ApiException(503,"ACTIVITY_CONTRACT_INVALID","No se pudo acreditar cobertura completa del segmento.");
    return {...activity,users:directory.users};
  }
  async profile(id:string):Promise<{user:DirectoryCustomer;activity:CustomerActivity;orders:AuthoritativeOrder[];complete:boolean;referenceAt:string}> {
    const source=await this.activity(id);
    const history=await this.orders<{orders:AuthoritativeOrder[];complete:boolean}>("customer-orders",[id]);
    return {...source,...history};
  }
  async activity(id:string):Promise<{user:DirectoryCustomer;activity:CustomerActivity;referenceAt:string}> {
    const {user}=await this.directory<{user:DirectoryCustomer}>("/"+encodeURIComponent(id));
    const activity=await this.orders<{referenceAt:string;customers:CustomerActivity[]}>("customer-activity",[id]);
    if (!activity.customers[0]) throw new ApiException(503,"ACTIVITY_CONTRACT_INVALID","La actividad del cliente no está disponible.");
    return {user,activity:activity.customers[0],referenceAt:activity.referenceAt};
  }
}
