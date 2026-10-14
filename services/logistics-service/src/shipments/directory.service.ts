import { Injectable } from "@nestjs/common";
import { ApiException } from "../common/api-exception";
@Injectable()
export class LogisticsDirectoryService {
  private async request<T>(path:string):Promise<T> {
    try {
      const response=await fetch(`${process.env.AUTH_SERVICE_URL ?? "http://servicio-autenticacion:3001"}/internal/directory${path}`,{headers:{"x-directory-service":"logistics","x-internal-service-key":process.env.LOGISTICS_IDENTITY_DIRECTORY_KEY ?? ""},signal:AbortSignal.timeout(5000)});
      if (response.status===404) throw new ApiException(422,"COURIER_UNAVAILABLE","El repartidor debe ser un empleado habilitado con acceso a su cuenta.");
      if (!response.ok) throw new Error("Directory unavailable"); return await response.json() as T;
    } catch(error) { if (error instanceof ApiException) throw error; throw new ApiException(503,"COURIER_DIRECTORY_UNAVAILABLE","No se pudo verificar el directorio de repartidores. Intenta de nuevo."); }
  }
  async couriers():Promise<Array<{id:string;name:string}>> {
    const data=await this.request<{users:Array<{id:string;name:string}>;complete:boolean}>("");
    if (!data.complete) throw new ApiException(503,"DIRECTORY_LIMIT","El directorio supera el límite de esta versión.");
    return data.users.map(user=>({id:user.id,name:user.name}));
  }
  async courier(id:string):Promise<{id:string;name:string}> { return (await this.request<{user:{id:string;name:string}}>("/"+encodeURIComponent(id))).user; }
}
