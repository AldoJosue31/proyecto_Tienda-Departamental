import { describe, expect, it } from "vitest";

import {
  consumeCustomerCart,
  customerCartItemCount,
  normalizeCustomerCart,
  removeCustomerCartLine,
  reviseCustomerCart,
} from "../src/lib/cart/customer-cart";

describe("bolsa persistente de CUSTOMER", () => {
  const lamp = { productId: "product-lamp", variantId: "variant-arena" };

  it("normaliza datos guardados y no conserva metadatos de catálogo", () => {
    const lines = normalizeCustomerCart([
      { ...lamp, quantity: 1, price: 1499, name: "Lámpara" },
      { ...lamp, quantity: 2 },
      { productId: "", variantId: "invalid", quantity: 1 },
    ]);

    expect(lines).toEqual([{ ...lamp, quantity: 3 }]);
    expect(Object.keys(lines[0])).toEqual(["productId", "variantId", "quantity"]);
  });

  it("ajusta y elimina líneas sin permitir cantidades negativas", () => {
    const added = reviseCustomerCart([], lamp, 1);
    const incremented = reviseCustomerCart(added, lamp, 2);

    expect(customerCartItemCount(incremented)).toBe(3);
    expect(reviseCustomerCart(incremented, lamp, -3)).toEqual([]);
    expect(removeCustomerCartLine([{ ...lamp, quantity: 1 }], lamp.variantId)).toEqual([]);
  });

  it("consume sólo la cantidad que se confirmó y conserva cambios posteriores", () => {
    const current = [{ ...lamp, quantity: 3 }];

    expect(consumeCustomerCart(current, [{ ...lamp, quantity: 1 }])).toEqual([{ ...lamp, quantity: 2 }]);
  });
});
