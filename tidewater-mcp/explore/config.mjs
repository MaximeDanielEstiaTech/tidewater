import path from "node:path";
import { fileURLToPath } from "node:url";

// Use the same values as the server, so that the scripts find Chrome on each computer.
export { APP_URL, CHROME_PATH, PROFILE_DIR, DEBUG_PORT } from "../src/config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = path.join(here, "out");
