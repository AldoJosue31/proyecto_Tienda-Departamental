import { randomUUID } from "node:crypto";
type Request = { header(name: string): string | undefined };
type Response = { setHeader(name: string, value: string): void; status(code: number): Response; json(body: unknown): void };
type NextFunction = () => void;

/** No Origin is valid for private/server clients. Browser origins are explicit. */
export function rejectUnlistedOrigins(origins: readonly string[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const origin = request.header("origin");
    if (!origin || origins.includes(origin)) { next(); return; }
    const correlationId = randomUUID();
    response.setHeader("X-Correlation-Id", correlationId);
    response.setHeader("Cache-Control", "no-store");
    response.status(403).json({ code: "ORIGIN_NOT_ALLOWED", message: "Origen no autorizado", correlationId });
  };
}
