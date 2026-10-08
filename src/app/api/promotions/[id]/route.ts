import { promotionRequest } from "../_shared";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return promotionRequest(request, (await context.params).id);
}
