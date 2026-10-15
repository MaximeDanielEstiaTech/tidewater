// Opens a visible Chrome on the timesheet app and records the network traffic of the app.
// The browser stays open until you close it. Other scripts can connect on DEBUG_PORT.
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { APP_URL, CHROME_PATH, PROFILE_DIR, DEBUG_PORT, OUT_DIR } from "./config.mjs";

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(PROFILE_DIR, { recursive: true });
const netLog = fs.createWriteStream(path.join(OUT_DIR, "network.jsonl"), { flags: "a" });

const MAX_BODY = 20_000;
const IGNORED = /\.(png|jpe?g|gif|svg|woff2?|ttf|css|ico)(\?|$)/i;

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: false,
  userDataDir: PROFILE_DIR,
  debuggingPort: DEBUG_PORT,
  defaultViewport: null,
  args: ["--start-maximized"],
});

async function watch(page) {
  page.on("response", async (res) => {
    const req = res.request();
    const type = req.resourceType();
    if (!["xhr", "fetch", "document"].includes(type) || IGNORED.test(req.url())) return;
    let body;
    try {
      const text = await res.text();
      body = text.length > MAX_BODY ? text.slice(0, MAX_BODY) + "...[cut]" : text;
    } catch {
      body = null;
    }
    netLog.write(
      JSON.stringify({
        t: new Date().toISOString(),
        type,
        method: req.method(),
        url: req.url(),
        status: res.status(),
        reqHeaders: pick(req.headers(), ["content-type", "accept", "x-requestdigest", "authorization"]),
        postData: req.postData() ?? null,
        body,
      }) + "\n",
    );
  });
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) console.log("[nav]", f.url());
  });
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k]) out[k] = k === "authorization" ? obj[k].slice(0, 20) + "..." : obj[k];
  return out;
}

browser.on("targetcreated", async (t) => {
  const p = await t.page();
  if (p) watch(p);
});

const [page] = await browser.pages();
await watch(page);
await page.goto(APP_URL, { waitUntil: "domcontentloaded" });

console.log(`Chrome is open. Debug port: ${DEBUG_PORT}. Sign in if necessary.`);
console.log(`Network log: ${path.join(OUT_DIR, "network.jsonl")}`);
browser.on("disconnected", () => {
  netLog.end();
  console.log("Browser closed.");
  process.exit(0);
});
