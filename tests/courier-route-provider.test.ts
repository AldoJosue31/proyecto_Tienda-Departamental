import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/logistics/pick-pack.server",()=>({getPickPackShipment:vi.fn()}));
import { getPickPackShipment } from "@/lib/logistics/pick-pack.server";
import { getCourierRoute } from "@/lib/logistics/courier-route.server";
describe("Routes provider recovery",()=>{
  beforeEach(()=>{vi.stubEnv("GOOGLE_MAPS_ROUTES_API_KEY","fixture-private-key");vi.mocked(getPickPackShipment).mockResolvedValue({tracking:{location:{latitude:19.43,longitude:-99.13,recordedAt:new Date().toISOString()},deliveryAddress:"Zócalo, Ciudad de México"}} as never);});
  afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
  it("does not request a route without provider configuration",async()=>{vi.stubEnv("GOOGLE_MAPS_ROUTES_API_KEY","");const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);await expect(getCourierRoute("id")).resolves.toMatchObject({available:false});expect(fetcher).not.toHaveBeenCalled();});
  it("keeps tracking usable after a provider rejection",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("denied",{status:403})));await expect(getCourierRoute("id")).resolves.toMatchObject({available:false});});
  it("keeps tracking usable after a timeout",async()=>{vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("timeout")));await expect(getCourierRoute("id")).resolves.toMatchObject({available:false});});
  it("verifies the destination from the provider rather than guessing coordinates",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({routes:[{duration:"120s",distanceMeters:500,polyline:{encodedPolyline:"fixture"},legs:[{endLocation:{latLng:{latitude:19.4326,longitude:-99.1332}}}]}]})));await expect(getCourierRoute("id")).resolves.toMatchObject({available:true,destination:{latitude:19.4326,longitude:-99.1332},durationSeconds:120});});
});
