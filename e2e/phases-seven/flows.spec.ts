import {readFileSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {test,expect,capture,signIn} from "../accounts/helpers";
import {api,login,pool,until} from "../../scripts/release-test-support.mjs";

const env=Object.fromEntries(readFileSync(".env.integration","utf8").split(/\r?\n/).map(line=>{const at=line.indexOf("=");return[line.slice(0,at),line.slice(at+1)];}));
type Variant={id:string;sku:string;size:string;color:string;material:string};
const fixture=JSON.parse(readFileSync(".env.phase-seven-fixture","utf8")) as {product:{id:string;name:string;category:{slug:string};brand:{slug:string}};variants:Variant[];branches:{id:string;name:string}[];otherCustomerEmail:string};
test.describe.configure({mode:"serial"});
const inventory=pool("inventory"),orders=pool("orders"),logistics=pool("logistics");
test.afterAll(async()=>{await Promise.all([inventory.end(),orders.end(),logistics.end()]);});

test("ADMIN creates a product and variant, edits attributes and navigates by keyboard",async({page})=>{
 await signIn(page,"admin@departamental.local",env.SEED_ADMIN_PASSWORD,"/catalog/manage?q="+encodeURIComponent(fixture.product.name));
 const forms=page.locator("form"),productForm=forms.filter({has:page.getByRole("heading",{name:"Crear producto base"})});
 const name=fixture.product.name+" Base UI "+randomUUID().slice(0,6);
 await productForm.getByLabel("Nombre",{exact:true}).fill(name);await productForm.getByLabel("Categoría",{exact:true}).fill("Cierre Moda");await productForm.getByLabel("Marca",{exact:true}).fill("Universidad");
 await productForm.getByRole("button",{name:"Crear producto",exact:true}).click();await expect(productForm.getByRole("status")).toContainText("creado");
 const variantForm=forms.filter({has:page.getByRole("heading",{name:"Registrar variante"})}),sku="C7-UI-"+randomUUID().slice(0,8);
 await variantForm.getByLabel("Producto base").selectOption({label:name});await variantForm.getByLabel("SKU",{exact:true}).fill(sku);await variantForm.getByLabel("Talla",{exact:true}).fill("M");await variantForm.getByLabel("Color",{exact:true}).fill("Azul");await variantForm.getByLabel("Material",{exact:true}).fill("Algodón");await variantForm.getByLabel("Precio de lista").fill("125");
 await variantForm.getByRole("button",{name:"Agregar variante"}).click();await expect(page.getByRole("button").filter({hasText:sku})).toBeVisible();
 await page.getByRole("button").filter({hasText:sku}).click();const editor=page.getByRole("complementary",{name:"Editar "+sku});
 await editor.getByLabel("Material",{exact:true}).fill("Lino");await editor.getByRole("button",{name:/Guardar/}).click();await expect(editor.getByRole("status")).toBeVisible();
 await page.getByLabel("Buscar producto o SKU").focus();await page.keyboard.press("Tab");await expect(page.getByRole("button",{name:"Buscar catálogo"})).toBeFocused();
 await capture(page,"phase7-variants");
});

test("EMPLOYEE records receipts and inclusive reorder points from desktop and mobile",async({page})=>{
 await signIn(page,"employee@departamental.local",env.SEED_EMPLOYEE_PASSWORD,"/operations/inventory");
 await page.getByRole("combobox",{name:"Sucursal",exact:true}).selectOption(fixture.branches[0].id);await page.getByLabel("Buscar variante").fill(fixture.variants[0].sku);
 const row=page.getByRole("button").filter({hasText:fixture.variants[0].sku});await expect(row).toHaveCount(1);await row.click();
 const current=Number((await inventory.query("SELECT on_hand-reserved AS n FROM inventory_stock WHERE variant_id=$1 AND branch_id=$2",[fixture.variants[0].id,fixture.branches[0].id])).rows[0].n);
 await page.getByLabel("Cantidad",{exact:true}).fill("1");await page.getByLabel(/Punto de pedido/).fill(String(current+1));
 await page.getByRole("button",{name:"Registrar recepción",exact:true}).click();await expect(row).toContainText(`${current+1} disponibles`);await expect(row).toContainText("Reabastecer");
 await capture(page,"phase7-replenishment");
});

test("EMPLOYEE completes a physical ticket with current price and optional customer, without shipment",async({page})=>{
 await signIn(page,"employee@departamental.local",env.SEED_EMPLOYEE_PASSWORD,"/operations/sales");
 await page.getByLabel("Sucursal de venta").selectOption(fixture.branches[0].id);await page.getByLabel("Buscar producto o SKU").fill(fixture.variants[3].sku);
 const row=page.locator("article").filter({hasText:fixture.variants[3].sku});await expect(row).toHaveCount(1);await row.getByRole("button",{name:/Agregar/}).click();
 const response=page.waitForResponse(r=>r.url().endsWith("/api/operations/sales")&&r.request().method()==="POST");
 await page.getByRole("button",{name:/Confirmar venta/}).click();const result=await response;expect(result.status()).toBe(201);const body=await result.json();expect(body.order.channel).toBe("PHYSICAL");expect(body.order.status).toBe("CONFIRMED");
 await expect(page.getByText(/Venta confirmada/).first()).toBeVisible();await expect.poll(async()=>Number((await logistics.query("SELECT COUNT(*)::int AS n FROM logistics_shipments WHERE order_id=$1",[body.order.id])).rows[0].n)).toBe(0);
 await capture(page,"phase7-physical-sale");
});

test("CUSTOMER keeps catalog filters after return and buys an exact variant then cancels through UI",async({page})=>{
 await signIn(page,"customer@departamental.local",env.SEED_CUSTOMER_PASSWORD,"/?q="+encodeURIComponent(fixture.product.name));
 await page.getByRole("combobox",{name:"Categoría",exact:true}).selectOption(fixture.product.category.slug);await expect(page).toHaveURL(/category=/);await page.getByRole("combobox",{name:"Marca",exact:true}).selectOption(fixture.product.brand.slug);await expect(page).toHaveURL(/brand=/);
 const catalogUrl=page.url();await page.goto("/orders");await page.goBack();await expect(page).toHaveURL(catalogUrl);await expect(page.getByRole("combobox",{name:"Categoría",exact:true})).toHaveValue(fixture.product.category.slug);
 const card=page.locator("article").filter({has:page.getByRole("heading",{name:fixture.product.name,exact:true})});await card.getByRole("button",{name:"Elegir y agregar"}).click();
 const dialog=page.getByRole("dialog");await dialog.getByRole("combobox",{name:"Talla",exact:true}).selectOption("M");await dialog.getByRole("combobox",{name:"Color",exact:true}).selectOption("Negro");await dialog.getByRole("combobox",{name:"Material",exact:true}).selectOption("Lino");await dialog.getByRole("button",{name:/Agregar a/}).click();await page.keyboard.press("Escape");
 await page.goto("/checkout");await page.locator('label').filter({has:page.locator('input[name="checkout-branch"][value="'+fixture.branches[0].id+'"]')}).click();
 await capture(page,"phase7-online-checkout");const response=page.waitForResponse(r=>r.url().endsWith("/api/checkout")&&r.request().method()==="POST");await page.getByRole("button",{name:"Confirmar pedido",exact:true}).click();const result=await response;expect(result.status()).toBe(201);const body=await result.json();
 await expect(page.getByRole("heading",{name:"Tu compra quedó registrada."})).toBeFocused();await page.getByRole("link",{name:"Ver mis pedidos"}).click();await page.goto("/orders/"+body.order.id);
 await expect(page.getByRole("heading",{name:"Detalle de pedido"})).toBeVisible();await page.getByRole("button",{name:"Cancelar pedido",exact:true}).click();await expect(page.getByRole("button",{name:"Conservar pedido"})).toBeFocused();await page.getByRole("button",{name:"Confirmar cancelación"}).click();await expect(page.getByRole("status").filter({hasText:"Pedido cancelado"})).toBeVisible();
 expect((await orders.query("SELECT status FROM orders WHERE id=$1",[body.order.id])).rows[0].status).toBe("CANCELLED");await capture(page,"phase7-online-cancelled");
});

test("Dashboard receives 12 physical sales, reconnects and shows AGOTADO without revision regression",async({page,context})=>{
 await signIn(page,"admin@departamental.local",env.SEED_ADMIN_PASSWORD,"/dashboard");await page.getByRole("combobox",{name:"Sucursal",exact:true}).selectOption(fixture.branches[0].id);await expect(page.getByText("Actualización en tiempo real activa",{exact:true})).toBeVisible();
 const variant=fixture.variants[5],row=page.locator("table").last().getByRole("row").filter({hasText:variant.sku});await expect(row).toBeVisible();const admin=await login("admin"),latencies:number[]=[];
 let available=Number((await inventory.query("SELECT on_hand-reserved AS n FROM inventory_stock WHERE variant_id=$1 AND branch_id=$2",[variant.id,fixture.branches[0].id])).rows[0].n);
 for(let i=0;i<12;i++){const started=Date.now();const r=await api("/orders",{token:admin.accessToken,method:"POST",headers:{"Idempotency-Key":randomUUID()},body:{branchId:fixture.branches[0].id,channel:"PHYSICAL",items:[{productId:fixture.product.id,variantId:variant.id,quantity:1}]}});expect(r.status).toBe(201);available--;await expect(row.getByRole("cell").nth(5)).toHaveText(String(available));latencies.push(Date.now()-started);}
 const ordered=[...latencies].sort((a,b)=>a-b),p95=ordered[Math.ceil(ordered.length*0.95)-1];expect(p95).toBeLessThanOrEqual(3000);
 await context.setOffline(true);await expect(page.getByText("Conexión interrumpida; usamos recarga de respaldo",{exact:true})).toBeVisible();
 const r=await api("/orders",{token:admin.accessToken,method:"POST",headers:{"Idempotency-Key":randomUUID()},body:{branchId:fixture.branches[0].id,channel:"PHYSICAL",items:[{productId:fixture.product.id,variantId:variant.id,quantity:available}]}});expect(r.status).toBe(201);await context.setOffline(false);await expect(row.getByRole("cell").nth(5)).toHaveText("0");await expect(row).toContainText("AGOTADO");
 await page.getByRole("combobox",{name:"Sucursal",exact:true}).selectOption(fixture.branches[1].id);await page.getByRole("combobox",{name:"Sucursal",exact:true}).selectOption(fixture.branches[0].id);await expect(row.getByRole("cell").nth(5)).toHaveText("0");
 await until(async()=>(await inventory.query("SELECT on_hand FROM inventory_stock WHERE variant_id=$1 AND branch_id=$2",[variant.id,fixture.branches[0].id])).rows[0].on_hand===0);
 writeFileSync("docs/verification-inventory-browser-latency.json",JSON.stringify({completedAt:new Date().toISOString(),passed:true,project:"departamental-five-phases",sampleSize:12,milliseconds:latencies,p95Milliseconds:p95,measurement:"HTTP sale request start through visible Dashboard available cell; healthy local Docker, one browser",targetMilliseconds:3000,reconnectedSnapshot:true},null,2)+"\n");await capture(page,"phase7-exhausted-dashboard");
});

test("CUSTOMER bags stay separate when the same browser changes accounts",async({page,context})=>{
 await signIn(page,"customer@departamental.local",env.SEED_CUSTOMER_PASSWORD,"/?q="+encodeURIComponent(fixture.product.name));
 const card=page.locator("article").filter({has:page.getByRole("heading",{name:fixture.product.name,exact:true})});await card.getByRole("button",{name:"Elegir y agregar"}).click();const dialog=page.getByRole("dialog");
 await dialog.getByRole("combobox",{name:"Talla",exact:true}).selectOption("S");await dialog.getByRole("combobox",{name:"Color",exact:true}).selectOption("Azul");await dialog.getByRole("combobox",{name:"Material",exact:true}).selectOption("Algodón");await dialog.getByRole("button",{name:"Agregar a la bolsa"}).click();await page.keyboard.press("Escape");
 await context.clearCookies();await signIn(page,fixture.otherCustomerEmail,env.SEED_CUSTOMER_PASSWORD,"/checkout");await expect(page.getByRole("heading",{name:/bolsa.*vacía/i})).toBeVisible();
 await context.clearCookies();await signIn(page,"customer@departamental.local",env.SEED_CUSTOMER_PASSWORD,"/checkout");await expect(page.getByText(fixture.product.name,{exact:true})).toBeVisible();await page.getByRole("button",{name:"Quitar "+fixture.product.name,exact:true}).click();await expect(page.getByRole("heading",{name:/bolsa.*vacía/i})).toBeVisible();
});
