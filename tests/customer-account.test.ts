import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

describe("centro de cuenta de CUSTOMER", () => {
  it("mantiene una experiencia específica de cliente sin afectar las vistas internas", () => {
    const page = read("src/app/(platform)/account/page.tsx");

    expect(page).toContain('if (user.role === "CUSTOMER") return <CustomerAccount user={user} />');
    expect(page).toContain("roleLabel[user.role]");
  });

  it("orienta a acciones reales y omite identificadores técnicos o funcionalidades inexistentes", () => {
    const account = read("src/components/customer-account.tsx");

    expect(account).toContain("Compras y entregas");
    expect(account).toContain('href="/orders"');
    expect(account).toContain('href="/"');
    expect(account).toContain("Correo de acceso");
    expect(account).toContain("cerrar esta sesión desde el encabezado");
    expect(account).not.toContain("user.id");
    expect(account).not.toContain("Editar perfil");
    expect(account).not.toContain("Ubicación del repartidor");
  });
});
