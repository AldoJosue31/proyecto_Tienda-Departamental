import { describe, expect, it } from "vitest";
import { passwordPairSchema, registrationFormSchema, tokenFromFragment } from "../src/lib/auth/onboarding-ui";
import { GUEST_CART_KEY, customerCartStorageKey, loadShoppingCart } from "../src/lib/cart/customer-cart";

describe("Alta de cuentas y continuidad de la compra", () => {
  it("exige coincidencia y aplica el límite UTF-8 sin truncar contraseñas", () => {
    expect(passwordPairSchema.safeParse({ password: "una frase muy segura", confirmation: "otra frase muy segura" }).success).toBe(false);
    expect(passwordPairSchema.safeParse({ password: "😀".repeat(19), confirmation: "😀".repeat(19) }).success).toBe(false);
    expect(passwordPairSchema.safeParse({ password: "😀".repeat(15), confirmation: "😀".repeat(15) }).success).toBe(true);
    expect(passwordPairSchema.safeParse({ password: "😀".repeat(8), confirmation: "😀".repeat(8) }).success).toBe(false);
  });
  it("normaliza el correo y no permite elegir un rol en el formulario", () => {
    const body = { name: "Cliente", email: " CLIENTE@EXAMPLE.TEST ", password: "una frase muy segura", confirmation: "una frase muy segura" };
    expect(registrationFormSchema.parse(body).email).toBe("cliente@example.test");
    expect(registrationFormSchema.safeParse({ ...body, role: "ADMIN" }).success).toBe(false);
  });
  it("solo lee un token de fragmento válido y rechaza valores ambiguos", () => {
    const token = "a".repeat(43);
    expect(tokenFromFragment(`#token=${token}`)).toBe(token);
    expect(tokenFromFragment(`#token=${token}&token=${token}`)).toBe(null);
    expect(tokenFromFragment("#token=bad")).toBe(null);
    expect(tokenFromFragment("#other=value")).toBe(null);
  });
  it("integra la bolsa anónima una vez y conserva las bolsas de otros clientes", () => {
    const item = { productId: "product", variantId: "variant", quantity: 2 };
    const rows = new Map([[GUEST_CART_KEY, JSON.stringify([item])], [customerCartStorageKey("other"), JSON.stringify([{ ...item, quantity: 3 }])]]);
    const storage = { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); }, removeItem: (key: string) => { rows.delete(key); } };
    expect(loadShoppingCart(storage, null, true)).toEqual([item]);
    expect(loadShoppingCart(storage, null, false)).toEqual([]);
    expect(loadShoppingCart(storage, "new", false)).toEqual([item]);
    expect(loadShoppingCart(storage, "new", false)).toEqual([item]);
    expect(rows.has(GUEST_CART_KEY)).toBe(false);
    expect(JSON.parse(rows.get(customerCartStorageKey("other"))!)[0].quantity).toBe(3);
  });
  it("combina cantidades dentro de los límites y tolera almacenamiento bloqueado", () => {
    const item = { productId: "product", variantId: "variant", quantity: 15 };
    const storage = { getItem: () => JSON.stringify([item]), setItem: () => { throw new Error("Storage blocked"); }, removeItem: () => {} };
    expect(loadShoppingCart(storage, "customer", false)[0].quantity).toBe(20);
    expect(loadShoppingCart({ ...storage, getItem: () => "corrupt" }, null, true)).toEqual([]);
  });
});
