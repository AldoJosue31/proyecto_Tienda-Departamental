import "server-only";
import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE } from "./session.server";
import { gatewayJson } from "./gateway-client.server";
import { employeePageSchema } from "./onboarding-ui";

export async function getEmployees() {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  const result = await gatewayJson<unknown>("/auth/employees?page=1&pageSize=20", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!result.response.ok) throw new Error("Employee listing unavailable");
  return employeePageSchema.parse(result.body);
}
