// Gives a page on the timesheet app.
// If a Chrome is open on DEBUG_PORT (for example from explore/launch.mjs), the server uses it.
// If not, the server starts a visible Chrome with the persistent profile.
import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { APP_URL, CHROME_PATH, PROFILE_DIR, DEBUG_PORT } from "./config.mjs";

const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

let browser = null;

async function getBrowser() {
  if (browser?.connected) return browser;
  try {
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: null });
  } catch {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: false,
      userDataDir: PROFILE_DIR,
      debuggingPort: DEBUG_PORT,
      defaultViewport: null,
      args: ["--start-maximized"],
    });
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
  await page.waitForFunction(
    () => {
      const root = window.angular?.element(document.body).injector()?.get("$rootScope");
      return root?.CurrentUser?.Id && root?.SystemSettings;
    },
    { timeout: 60_000, polling: 500 },
  );
  return page;
}
