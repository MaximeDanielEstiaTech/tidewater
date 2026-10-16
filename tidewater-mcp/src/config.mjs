import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const APP_URL =
  "https://netestia.sharepoint.com/sites/appcatalog/ClientSideAssets/211c67c8-63f5-40f9-b458-d6b646096974/index.aspx?SPHostUrl=https%3A%2F%2Fnetestia.sharepoint.com%2Fsites%2FWorkTimePro%2FAPP&CatalogUrl=https%3A%2F%2Fnetestia.sharepoint.com%2Fsites%2Fappcatalog#!/timesheets/my";

export const LIST_DATA_URL = "https://netestia.sharepoint.com/sites/WorkTimePro/APP/_vti_bin/ListData.svc";

// Returns the path of chrome.exe: CHROME_PATH if set, else the first standard Windows location
// that exists, else null. Chrome can be in "Program Files", "Program Files (x86)" or the user folder.
export function findChrome(env = process.env, exists = fs.existsSync) {
  if (env.CHROME_PATH) return env.CHROME_PATH;
  const suffix = path.win32.join("Google", "Chrome", "Application", "chrome.exe");
  const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean);
  return roots.map((root) => path.win32.join(root, suffix)).find((p) => exists(p)) ?? null;
}

export const CHROME_PATH = findChrome();

// Keep the browser profile out of Google Drive. The profile has many small files that change often.
export const PROFILE_DIR =
  process.env.WTP_PROFILE_DIR ??
  path.join(process.env.LOCALAPPDATA ?? os.homedir(), "tidewater-mcp", "chrome-profile");

export const DEBUG_PORT = Number(process.env.WTP_DEBUG_PORT ?? 9222);

// The maximum hours for one working day.
export const MAX_HOURS_PER_DAY = 7.33;

// The default "Projet/Tâche" entries. The text must be the same as the text in the app.
export const DEFAULT_TASKS = [
  "CYCLE INGENIEUR (CI) > 1ère année",
  "CYCLE INGENIEUR (CI) > 2ème année",
  "PANDRONE - ETECH/PANDRO > -",
  "RECHERCHE SUR FONDS PROPRES > -",
];

export const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
export const MONTHS_EN = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
