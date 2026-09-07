import { runScheduledMaintenance } from "@/lib/server/scheduler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const configuredSecret = process.env.SCHEDULER_SECRET;
  const providedSecret = request.headers.get("x-scheduler-secret");
  if (configuredSecret && providedSecret !== configuredSecret) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  return Response.json(await runScheduledMaintenance());
}
