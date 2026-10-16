import {readFileSync} from "node:fs";
import {test,expect,env,auth,orders,signIn,capture,assertIsolation} from "../accounts/helpers";
const fixture=Object.fromEntries(readFileSync(".env.phases-four-six-fixture","utf8").split(/\r?\n/).filter(Boolean).map(line=>{const at=line.indexOf("=");return[line.slice(0,at),line.slice(at+1)];}));
test.describe.configure({mode:"serial"});test.beforeAll(assertIsolation);test.afterAll(async()=>{await auth.end();await orders.end();});
test("Dashboard renders real pie, both ranking metrics and accessible data on desktop and mobile",async({page})=>{
  await signIn(page,"admin@departamental.local",env.SEED_ADMIN_PASSWORD,"/dashboard");
  await expect(page.getByRole("heading",{name:"Top categorías"})).toBeVisible();await expect(page.getByRole("img",{name:"Gráfica de pastel de inventario por sucursal"})).toBeVisible();
  await page.getByLabel("Comparar rankings por").selectOption("sales");await page.getByRole("button",{name:"7 días",exact:true}).click();await expect(page.getByText(/Ranking por importe vendido/).first()).toBeVisible();
  await page.getByText("Ver datos de Top categorías",{exact:true}).click();await expect(page.getByRole("table").filter({has:page.getByText("Categoría",{exact:true})})).toBeVisible();
  const pie=page.getByRole("img",{name:"Gráfica de pastel de inventario por sucursal"});
  // Inspect a small center area so an antialiased boundary pixel does not
  // masquerade as a hole. A doughnut's center would remain transparent.
  await expect.poll(()=>pie.evaluate(element=>{const canvas=element as HTMLCanvasElement;const pixels=canvas.getContext("2d")?.getImageData(Math.floor(canvas.width/2)-2,Math.floor(canvas.height/2)-2,5,5).data;if(!pixels)return false;for(let at=0;at<pixels.length;at+=4)if(pixels[at+3]>200 && Math.max(pixels[at],pixels[at+1],pixels[at+2])-Math.min(pixels[at],pixels[at+1],pixels[at+2])>50)return true;return false;})).toBe(true);
  let previousFrame="";await expect.poll(async()=>{const frame=await pie.evaluate(element=>(element as HTMLCanvasElement).toDataURL());const stable=frame===previousFrame;previousFrame=frame;return stable;},{intervals:[250]}).toBe(true);
  await capture(page,"phase4-dashboard");await page.getByRole("region",{name:"Stock por sucursal",exact:true}).screenshot({path:".impeccable/review/phase4-pie-chart.png",animations:"disabled"});
});
test("CRM presents names, separate inactivity cohorts and the historical coupon discount",async({page})=>{
  await signIn(page,"admin@departamental.local",env.SEED_ADMIN_PASSWORD,"/crm");await expect(page.getByText("Compradores inactivos",{exact:true})).toBeVisible();await expect(page.getByText("Sin compras · alta antigua",{exact:true})).toBeVisible();
  const response=await page.request.get(`/api/crm/customers/${fixture.CUSTOMER_ID}`);expect(response.status()).toBe(200);const profile=await response.json();expect(profile.purchases.some((p:{discountTotal:number})=>p.discountTotal>0)).toBe(true);
  const filter=page.getByRole("textbox").first();await filter.fill(fixture.CUSTOMER_ID);await page.getByRole("button").filter({hasText:/Cliente universitario/}).first().click();await expect(page.getByText(/Ahorro histórico/).first()).toBeVisible();await capture(page,"phase5-crm");
});
test("Employee selector uses accounts and the interactive OpenStreetMap marks demo coordinates",async({page})=>{
  // Automated acceptance uses a local tile stand-in; it does not scrape OSM tiles.
  if(process.env.UNIVERSITY_LIVE_TILES!=="1")await page.route("https://tile.openstreetmap.org/**",route=>route.fulfill({status:200,contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e8eee8"/><path d="M0 80H256M90 0V256" stroke="#fff" stroke-width="18"/></svg>'}));
  await signIn(page,"admin@departamental.local",env.SEED_ADMIN_PASSWORD,"/operations");await page.getByRole("button").filter({hasText:fixture.ORDER_ID.slice(0,8).toUpperCase()}).first().click();
  await expect(page.getByRole("img",{name:"Mapa OpenStreetMap con la última posición del repartidor"})).toBeVisible();await expect(page.locator(".leaflet-container")).toBeVisible();await expect.poll(()=>page.locator(".leaflet-tile-loaded").count()).toBeGreaterThan(0);await page.locator(".leaflet-control-zoom-in").click();await expect(page.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");await expect(page.getByText("Ubicación ficticia · demostración universitaria.")).toBeVisible();
  await page.getByText("Editar asignación de reparto",{exact:true}).click();await expect(page.getByLabel("Repartidor habilitado")).toBeVisible();expect(await page.getByLabel("Repartidor habilitado").locator("option").count()).toBeGreaterThan(1);await capture(page,process.env.UNIVERSITY_LIVE_TILES==="1" ? "phase6-map-live" : "phase6-map");
});
test("Mobile courier starts and stops demo publication, explains permission denial and recovers offline GPS",async({page,context})=>{
  await page.setViewportSize({width:390,height:844});await signIn(page,"employee@departamental.local",env.SEED_EMPLOYEE_PASSWORD,"/delivery");await page.getByLabel("Envío asignado").selectOption(fixture.SHIPMENT_ID);
  await page.getByRole("button",{name:"Iniciar publicación"}).click();await expect(page.getByRole("status")).toContainText("Publicando ubicaciones ficticias",{timeout:20000});await page.getByRole("button",{name:"Detener",exact:true}).click();await expect(page.getByRole("status")).toContainText("Publicación detenida");
  await context.clearPermissions();await page.addInitScript(()=>{Object.defineProperty(navigator,"geolocation",{configurable:true,value:{watchPosition:(_success:unknown,failure:(error:{code:number})=>void)=>{setTimeout(()=>failure({code:1}),0);return 1;},clearWatch:()=>{},getCurrentPosition:()=>{}}});});await page.reload();await page.getByLabel("Envío asignado").selectOption(fixture.SHIPMENT_ID);await page.getByLabel("Origen de ubicación").selectOption("DEVICE");await page.getByRole("button",{name:"Iniciar publicación"}).click();await expect(page.getByRole("alert").filter({hasText:"Permiso GPS denegado"})).toBeVisible();
  // A new page avoids retaining the denied-provider test stub.
  const gps=await context.newPage();await gps.setViewportSize({width:390,height:844});await context.grantPermissions(["geolocation"]);await context.setGeolocation({latitude:19.433,longitude:-99.134});await gps.goto("/delivery");await gps.getByLabel("Envío asignado").selectOption(fixture.SHIPMENT_ID);await gps.getByLabel("Origen de ubicación").selectOption("DEVICE");await gps.getByRole("button",{name:"Iniciar publicación"}).click();await expect(gps.getByRole("status")).toContainText("Publicando GPS",{timeout:20000});
  try {
    await test.step("courier explains loss of network",async()=>{await context.setOffline(true);await expect(gps.getByRole("status")).toContainText("Sin red");});
    await test.step("courier resumes with a fresh browser GPS position",async()=>{await context.setOffline(false);await context.setGeolocation({latitude:19.434,longitude:-99.134});await expect(gps.getByRole("status")).toContainText("Publicando GPS",{timeout:20000});});
  } catch(error) {await gps.screenshot({path:".impeccable/review/courier-network-diagnostic.png",fullPage:true});throw error;}
  await gps.getByRole("button",{name:"Detener",exact:true}).click();
  // Leave the teaching fixture clearly fictional after testing browser GPS.
  await gps.getByLabel("Origen de ubicación").selectOption("DEMO");await gps.getByRole("button",{name:"Iniciar publicación"}).click();await expect(gps.getByRole("status")).toContainText("Publicando ubicaciones ficticias",{timeout:20000});await gps.getByRole("button",{name:"Detener",exact:true}).click();await gps.setViewportSize({width:1440,height:1000});await capture(gps,"phase6-delivery");await gps.close();
});
