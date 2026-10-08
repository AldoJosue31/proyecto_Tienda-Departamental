import { readFileSync,writeFileSync } from "node:fs";
const values=Object.fromEntries(readFileSync(".env","utf8").split(/\r?\n/).filter(line=>line.includes("=")&&!line.startsWith("#")).map(line=>{const at=line.indexOf("=");return [line.slice(0,at).trim(),line.slice(at+1).trim().replace(/^(["'])(.*)\1$/,"$2")];}));
const report={checkedAt:new Date().toISOString(),routesConfigured:Boolean(values.GOOGLE_MAPS_ROUTES_API_KEY),browserConfigured:Boolean(values.GOOGLE_MAPS_BROWSER_KEY),mapIdConfigured:Boolean(values.GOOGLE_MAPS_MAP_ID),routesVerified:false};
if (report.routesConfigured) {
  try {
    const response=await fetch("https://routes.googleapis.com/directions/v2:computeRoutes",{method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":values.GOOGLE_MAPS_ROUTES_API_KEY,"X-Goog-FieldMask":"routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.endLocation"},body:JSON.stringify({origin:{location:{latLng:{latitude:19.435,longitude:-99.14}}},destination:{address:"Zócalo, Ciudad de México, México"},travelMode:"DRIVE",routingPreference:"TRAFFIC_AWARE"}),signal:AbortSignal.timeout(10000)});
    const body=await response.json();report.httpStatus=response.status;report.routesVerified=response.ok&&Boolean(body.routes?.[0]?.polyline?.encodedPolyline)&&Boolean(body.routes?.[0]?.legs?.[0]?.endLocation?.latLng);
    if (!response.ok) report.providerError=body.error?.status ?? "PROVIDER_REJECTED";
  } catch {report.providerError="NETWORK_OR_TIMEOUT";}
}
writeFileSync("docs/verification-google-provider.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
