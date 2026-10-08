export type CustomerCartLine = {
  productId: string;
  variantId: string;
  quantity: number;
};

const MAX_CART_LINES = 20;
const MAX_LINE_QUANTITY = 20;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 220 ? value.trim() : null;
}

function quantity(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_LINE_QUANTITY ? value : null;
}

export function customerCartStorageKey(customerId: string) {
  return `departamental.customer-cart.v1:${encodeURIComponent(customerId)}`;
}

export function normalizeCustomerCart(value: unknown): CustomerCartLine[] {
  if (!Array.isArray(value)) return [];

  const lines = new Map<string, CustomerCartLine>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const productId = text(candidate.productId);
    const variantId = text(candidate.variantId);
    const lineQuantity = quantity(candidate.quantity);
    if (!productId || !variantId || !lineQuantity) continue;
    const key = `${productId}:${variantId}`;
    const previous = lines.get(key);
    lines.set(key, {
      productId,
      variantId,
      quantity: Math.min(MAX_LINE_QUANTITY, (previous?.quantity ?? 0) + lineQuantity),
    });
    if (lines.size >= MAX_CART_LINES) break;
  }
  return [...lines.values()];
}

export function reviseCustomerCart(
  current: CustomerCartLine[],
  input: Pick<CustomerCartLine, "productId" | "variantId">,
  delta: number,
): CustomerCartLine[] {
  if (!Number.isSafeInteger(delta) || delta === 0) return current;
  const productId = text(input.productId);
  const variantId = text(input.variantId);
  if (!productId || !variantId) return current;

  const index = current.findIndex((line) => line.productId === productId && line.variantId === variantId);
  if (index === -1) {
    if (delta < 0 || current.length >= MAX_CART_LINES) return current;
    return [...current, { productId, variantId, quantity: Math.min(MAX_LINE_QUANTITY, delta) }];
  }

  const nextQuantity = Math.min(MAX_LINE_QUANTITY, current[index].quantity + delta);
  if (nextQuantity <= 0) return current.filter((_, lineIndex) => lineIndex !== index);
  return current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: nextQuantity } : line);
}

export function consumeCustomerCart(current: CustomerCartLine[], sentLines: CustomerCartLine[]) {
  return normalizeCustomerCart(sentLines).reduce(
    (remaining, line) => reviseCustomerCart(remaining, line, -line.quantity),
    current,
  );
}

export function removeCustomerCartLine(current: CustomerCartLine[], variantId: string) {
  return current.filter((line) => line.variantId !== variantId);
}

export function customerCartItemCount(lines: CustomerCartLine[]) {
  return lines.reduce((total, line) => total + line.quantity, 0);
}
