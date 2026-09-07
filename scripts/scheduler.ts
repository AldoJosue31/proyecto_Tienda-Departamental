import { runScheduledMaintenance } from "../src/lib/server/scheduler";

async function run() {
  const result = await runScheduledMaintenance();
  console.info(JSON.stringify(result));
}

void run();
