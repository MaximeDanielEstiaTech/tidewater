import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

export const APP_URL =
  "https://netestia.sharepoint.com/sites/appcatalog/ClientSideAssets/211c67c8-63f5-40f9-b458-d6b646096974/index.aspx?SPHostUrl=https%3A%2F%2Fnetestia.sharepoint.com%2Fsites%2FWorkTimePro%2FAPP&CatalogUrl=https%3A%2F%2Fnetestia.sharepoint.com%2Fsites%2Fappcatalog#!/timesheets/my";

export const CHROME_PATH =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// Keep the browser profile out of Google Drive. The profile has many small files that change often.
export const PROFILE_DIR =
  process.env.WTP_PROFILE_DIR ??
  path.join(process.env.LOCALAPPDATA ?? os.homedir(), "tidewater-mcp", "chrome-profile");

export const DEBUG_PORT = Number(process.env.WTP_DEBUG_PORT ?? 9222);

const here = path.dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = path.join(here, "out");
