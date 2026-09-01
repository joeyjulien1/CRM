import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Loads .env for tests without pulling in a dotenv dependency. */
const envPath = join(process.cwd(), ".env");
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, value] = match;
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  // Falls through to whatever the environment already provides.
}
