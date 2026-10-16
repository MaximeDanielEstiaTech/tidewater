// Gives a page on the timesheet app.
// If a Chrome is open on DEBUG_PORT (for example from explore/launch.mjs), the server uses it.
// If not, the server starts a visible Chrome with the persistent profile. Chrome stays open after the server stops.
import fs from "node:fs";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import { APP_URL, CHROME_PATH, PROFILE_DIR, DEBUG_PORT } from "./config.mjs";
import { uiStep } from "./ui-errors.mjs";

const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

let browser = null;
let spawnError = null;

const CHROME_START_TIMEOUT_MS = 30_000;

// Starts a visible Chrome that does not depend on this Node process. Chrome stays open
// when the server, the CLI or a test stops, so the user stays signed in, and Node can end.
function startChrome() {
  if (!CHROME_PATH) {
    throw new Error("Chrome was not found. Install Google Chrome, or set CHROME_PATH to the path of chrome.exe.");
  }
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const child = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--start-maximized",
    ],
    { detached: true, stdio: "ignore" },
  );
  // Without this handler, a spawn error (for example an incorrect CHROME_PATH) stops the server.
  // getBrowser() then reports the error when the debug port does not open.
  child.on("error", (err) => { spawnError = err; });
  child.unref();
}

export async function getBrowser() {
  if (browser?.connected) return browser;
  const connect = () => puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: null });
  try {
    browser = await connect();
  } catch {
    spawnError = null;
    startChrome();
    const deadline = Date.now() + CHROME_START_TIMEOUT_MS;
    for (;;) {
      await new Promise((r) => setTimeout(r, 500));
      if (spawnError) {
        throw new Error(`Chrome did not start (${spawnError.code ?? spawnError.message}) from "${CHROME_PATH}". Set CHROME_PATH to the path of chrome.exe.`);
      }
      try {
        browser = await connect();
        break;
      } catch {
        if (Date.now() > deadline) {
          throw new Error(`Chrome did not open the debug port ${DEBUG_PORT}. Close all Chrome windows that use the tidewater profile, then try again.`);
        }
      }
    }
  }
  return browser;
}

// Returns a page where the Angular app is ready. If Microsoft asks for a sign-in,
// the function waits until the user signs in in the visible window.
export async function getAppPage() {
  const b = await getBrowser();
  const pages = await b.pages();
  let page = pages.find((p) => p.url().includes("index.aspx") && p.url().includes("ClientSideAssets"));
  if (!page) {
    page = pages.find((p) => p.url() === "about:blank") ?? (await b.newPage());
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  }
  await page.bringToFront();
  try {
    await page.waitForFunction(
      () => location.href.includes("ClientSideAssets") && window.angular && document.querySelector("[ui-view], .wrapper"),
      { timeout: SIGN_IN_TIMEOUT_MS, polling: 1000 },
    );
  } catch {
    throw new Error("The timesheet app did not open. Sign in to Microsoft in the Chrome window, then try again.");
  }
  // Wait until the app has loaded the current user.
  await uiStep(page, "load current user", () => page.waitForFunction(
    () => {
      const root = window.angular?.element(document.body).injector()?.get("$rootScope");
      return root?.CurrentUser?.Id && root?.SystemSettings;
    },
    { timeout: 60_000, polling: 500 },
  ));
  return page;
}
