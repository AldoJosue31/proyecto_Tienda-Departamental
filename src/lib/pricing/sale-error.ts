export class SaleRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

// A network error or 5xx can hide an accepted order. Retain its exact request
// and key until the same operation can be retried safely.
export function saleWasRejected(error: Error): boolean {
  return error instanceof SaleRequestError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status);
}
