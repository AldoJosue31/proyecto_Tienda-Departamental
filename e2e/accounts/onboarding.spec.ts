import { randomBytes } from "node:crypto";
import { test, expect, env, fixtureEmail, fixturePassword, auth, orders, userFor, direct, mailLink, signIn, capture, passwords, assertIsolation } from "./helpers";

test.describe.configure({ mode: "serial" });
test.beforeAll(assertIsolation);
test.afterAll(async () => { await Promise.all([auth.end(), orders.end()]); });

test("customer registers from checkout, confirms by SMTP, signs in and buys without losing the guest bag", async ({ page, context }) => {
  const email = fixtureEmail("customer");
  let selectedVariant = "";
  await test.step("anonymous selection and safe checkout return", async () => {
    await page.goto("/");
    await page.getByRole("button", { name: "Elegir y agregar" }).first().click();
    await page.getByRole("radio").first().press("Space");
    await page.getByRole("button", { name: "Agregar a la bolsa", exact: true }).click();
    await expect(page.getByRole("button", { name: "Agregada a la bolsa" })).toBeVisible();
    const items = await page.evaluate(() => JSON.parse(localStorage.getItem("departamental.guest-cart.v1") || "[]"));
    expect(items.length).toBe(1); selectedVariant = items[0].variantId;
    await page.getByRole("link", { name: /Ver bolsa/ }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fcheckout$/);
    await page.getByRole("link", { name: "Crear cuenta", exact: true }).click();
    await expect(page).toHaveURL(/\/register\?next=%2Fcheckout$/);
    await capture(page, "register");
  });
  await test.step("validation and customer-only registration", async () => {
    await page.getByLabel("Nombre completo").fill("Cliente de prueba de cuentas");
    await page.getByLabel("Correo electrónico").fill(email);
    await passwords(page);
    await page.getByLabel("Confirmar contraseña").fill("Otra frase de acceso diferente");
    await page.getByRole("button", { name: "Crear cuenta de cliente" }).click();
    await expect(page.getByText("Las contraseñas deben coincidir.")).toBeVisible();
    await page.getByLabel("Confirmar contraseña").fill(fixturePassword);
    await page.getByRole("button", { name: "Crear cuenta de cliente" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Revisa tu correo" })).toBeVisible();
    const user = await userFor(email); expect(user.role).toBe("CUSTOMER"); expect(user.onboarding_status).toBe("PENDING_EMAIL");
    expect((await context.cookies()).some(cookie => cookie.name === "departamental_access")).toBe(false);
  });
  await test.step("opening the mail does not consume the token and explicit confirmation does", async () => {
    await page.goto(await mailLink(email));
    await expect(page.getByRole("button", { name: "Confirmar mi correo" })).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    expect((await userFor(email)).onboarding_status).toBe("PENDING_EMAIL");
    await capture(page, "verify");
    await page.getByRole("button", { name: "Confirmar mi correo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Correo confirmado" })).toBeVisible();
    expect((await userFor(email)).onboarding_status).toBe("READY");
    expect((await context.cookies()).some(cookie => cookie.name === "departamental_access")).toBe(false);
    await page.getByRole("link", { name: "Iniciar sesión", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fcheckout$/);
  });
  await test.step("login merges the guest bag once and checkout creates an owned order", async () => {
    await signIn(page, email, fixturePassword, "/checkout");
    const user = await userFor(email);
    await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`departamental.customer-cart.v1:${id}`) || "[]").length, user.id)).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem("departamental.guest-cart.v1"))).toBe(null);
    await page.reload();
    await page.getByRole("radio").first().press("Space");
    await expect(page.getByRole("button", { name: "Confirmar pedido", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Confirmar pedido", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tu compra quedó registrada." })).toBeVisible();
    const persisted = await orders.query("SELECT o.id FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.customer_id=$1 AND i.variant_id=$2", [user.id, selectedVariant]);
    expect(persisted.rows.length).toBe(1);
    await page.getByRole("link", { name: "Ver mis pedidos" }).click();
    await expect(page).toHaveURL(/\/orders$/);
    expect((await context.cookies()).filter(cookie => /departamental_(access|refresh)/.test(cookie.name)).every(cookie => cookie.httpOnly)).toBe(true);
    await page.goto("/users"); await expect(page).toHaveURL(/\/forbidden$/);
  });
});

test("ADMIN invites with safe retry, resends, and disables then enables an employee who chose a password", async ({ page, browser }) => {
  const email = fixtureEmail("employee"), employeePage = await browser.newPage({ baseURL: "http://localhost:3105", viewport: { width: 1440, height: 1000 }, locale: "es-MX", colorScheme: "light" });
  const name = "Empleado de prueba de cuentas";
  await test.step("admin invitation retry preserves one operation", async () => {
    await signIn(page, "admin@departamental.local", env.SEED_ADMIN_PASSWORD, "/users");
    let drop = true;
    await page.route("**/api/auth/employees/invitations", async route => { const response = await route.fetch(); if (drop) { drop = false; await route.abort("failed"); } else await route.fulfill({ response }); });
    await page.getByLabel("Nombre completo").fill(name); await page.getByLabel("Correo del empleado").fill(email);
    await page.getByRole("button", { name: "Enviar invitación", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Revisa tu conexión" })).toBeVisible();
    await page.getByRole("button", { name: "Enviar invitación", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Invitación registrada" })).toBeVisible();
    const user = await userFor(email); expect(user.role).toBe("EMPLOYEE");
    expect((await auth.query("SELECT COUNT(*)::int AS count FROM auth_onboarding_challenges WHERE user_id=$1", [user.id])).rows[0].count).toBe(1);
    await page.getByLabel("Buscar por nombre o correo").fill(email); await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await capture(page, "users");
    await page.unroute("**/api/auth/employees/invitations");
  });
  let oldLink = "";
  await test.step("cooldown and resend replace the original invitation", async () => {
    oldLink = await mailLink(email);
    await page.getByRole("button", { name: "Reenviar invitación", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "un minuto" })).toBeVisible();
    await auth.query("UPDATE auth_onboarding_email_limits SET last_sent_at=NOW()-INTERVAL '61 seconds' WHERE email_hash=encode(sha256($1::bytea),'hex')", [email]);
    await page.getByRole("button", { name: "Reenviar invitación", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "El enlace anterior" })).toBeVisible();
    await employeePage.goto(oldLink); await passwords(employeePage);
    await employeePage.getByRole("button", { name: "Aceptar invitación", exact: true }).click();
    await expect(employeePage.getByRole("alert").filter({ hasText: "El enlace venció" })).toBeVisible();
  });
  await test.step("employee sets a password, signs in, and cannot access Users", async () => {
    await employeePage.goto(await mailLink(email));
    await expect(employeePage.getByLabel("Contraseña nueva", { exact: true })).toBeVisible();
    await expect.poll(() => new URL(employeePage.url()).hash).toBe("");
    await capture(employeePage, "invitation");
    await passwords(employeePage); await employeePage.getByRole("button", { name: "Aceptar invitación", exact: true }).click();
    await expect(employeePage.getByRole("status")).toContainText("Invitación aceptada");
    await signIn(employeePage, email, fixturePassword, "/operations");
    await expect(employeePage.getByRole("link", { name: "Usuarios", exact: true })).toHaveCount(0);
    await employeePage.goto("/users"); await expect(employeePage).toHaveURL(/\/forbidden$/);
  });
  await test.step("native confirmation supports cancellation and revokes access on approval", async () => {
    await page.getByRole("button", { name: "Actualizar lista", exact: true }).click();
    await expect(page.getByText("Cuenta lista", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^Desactivar a/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).not.toBeVisible();
    expect((await userFor(email)).is_active).toBe(true);
    await page.getByRole("button", { name: /^Desactivar a/ }).click();
    await page.getByRole("button", { name: "Confirmar desactivación" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Empleado desactivado" })).toBeVisible();
    expect((await userFor(email)).is_active).toBe(false);
    await employeePage.goto("/account"); await expect(employeePage).toHaveURL(/\/login\?/);
    await page.getByRole("button", { name: /^Habilitar a/ }).click();
    await page.getByRole("button", { name: "Confirmar habilitación" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Empleado habilitado" })).toBeVisible();
    await signIn(employeePage, email, fixturePassword, "/operations");
  });
  await employeePage.close();
});

test("confirmation in another browser requires a new password and reused links show recovery", async ({ page }) => {
  const email = fixtureEmail("cross-browser"), original = "Una contraseña original de prueba";
  const result = await direct("/auth/register", { name: "Cliente de prueba", email, password: original, browserNonce: randomBytes(32).toString("base64url"), returnPath: "/users" });
  expect(result.status).toBe(202);
  const link = await mailLink(email);
  await test.step("confirmation is explicit and fragment is removed", async () => {
    await page.goto(link); await page.getByRole("button", { name: "Confirmar mi correo" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "otro navegador" })).toBeVisible();
    await expect(page.getByLabel("Contraseña nueva", { exact: true })).toBeVisible();
    await passwords(page); await page.getByRole("button", { name: "Guardar contraseña y confirmar" }).click();
    await expect(page.getByRole("status")).toContainText("Correo confirmado");
    await page.getByRole("link", { name: "Iniciar sesión", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?next=%2F$/);
    expect((await direct("/auth/login", { email, password: original })).status).toBe(401);
    expect((await direct("/auth/login", { email, password: fixturePassword })).status).toBe(200);
  });
  await test.step("reused challenge gives an actionable recovery message", async () => {
    await page.goto(link); await page.getByRole("button", { name: "Confirmar mi correo" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "El enlace venció" })).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    await expect(page.getByRole("button", { name: "Reenviar verificación", exact: true })).toBeVisible();
  });
});

test("mobile forms handle missing links, keyboard validation, offline retry and generic resends", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await test.step("missing invitation and verification provide recovery", async () => {
    await page.goto("/accept-invitation"); await expect(page.getByRole("alert").filter({ hasText: "Pide a tu administrador" })).toBeVisible();
    await page.goto("/verify-email"); await expect(page.getByRole("alert").filter({ hasText: "Solicita otro enlace" })).toBeVisible();
    await page.getByLabel("Correo de tu registro").fill(fixtureEmail("unknown"));
    await page.getByRole("button", { name: "Reenviar verificación", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Si el correo tiene un registro pendiente");
    await expect(page.getByRole("button", { name: /Reenviar en/ })).toBeDisabled();
  });
  await test.step("offline registration preserves the form and validates with keyboard focus", async () => {
    await page.goto("/register?next=https%3A%2F%2Fexample.test");
    await page.getByRole("button", { name: "Crear cuenta de cliente" }).click();
    await expect(page.getByLabel("Nombre completo")).toBeFocused();
    await page.getByLabel("Nombre completo").fill("Cliente de prueba móvil");
    await page.getByLabel("Correo electrónico").fill(fixtureEmail("offline")); await passwords(page);
    await page.route("**/api/auth/onboarding/context", route => route.abort("failed"));
    await page.getByRole("button", { name: "Crear cuenta de cliente" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Revisa tu conexión" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear cuenta de cliente" })).toBeEnabled();
    expect(await userFor(fixtureEmail("offline"))).toBeUndefined();
    await expect(page.getByRole("link", { name: "Inicia sesión", exact: true })).toHaveAttribute("href", "/login?next=%2F");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
});
