import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.cwd(), ".env");
if (existsSync(path)) config({ path });
