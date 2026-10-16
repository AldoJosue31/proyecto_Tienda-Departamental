import {describe,expect,it,vi} from "vitest";
import {HttpExceptionFilter} from "../src/common/http-exception.filter";
describe("Catalog dependency errors",()=>{
 for(const error of [Object.assign(new Error("private connection data"),{code:"ECONNRESET"}),new Error("Connection terminated unexpectedly"),new Error("timeout exceeded when trying to connect"),new AggregateError([Object.assign(new Error(),{code:"ECONNREFUSED"})])]){
  it("returns a recoverable 503 without exposing connection details",()=>{
   const response={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};
   new HttpExceptionFilter().catch(error,{switchToHttp:()=>({getRequest:()=>({correlationId:"catalog-proof"}),getResponse:()=>response})} as never);
   expect(response.status).toHaveBeenCalledWith(503);expect(response.json).toHaveBeenCalledWith({code:"SERVICE_UNAVAILABLE",message:"Servicio no disponible",correlationId:"catalog-proof"});
  });
 }
 it("does not disguise an application exception as a dependency outage",()=>{const response={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};new HttpExceptionFilter().catch(new Error("application bug"),{switchToHttp:()=>({getRequest:()=>({}),getResponse:()=>response})} as never);expect(response.status).toHaveBeenCalledWith(500);});
});
