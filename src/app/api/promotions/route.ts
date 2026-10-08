import { promotionRequest } from "./_shared";
export const runtime = "nodejs";
export const GET = (request: Request) => promotionRequest(request);
export const POST = (request: Request) => promotionRequest(request);
