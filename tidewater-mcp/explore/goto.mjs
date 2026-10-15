// Connects to the Chrome that launch.mjs opened and goes to a hash route of the app.
// Usage: node explore/goto.mjs "#!/timesheets/view/1345"
import puppeteer from "puppeteer-core";
import { DEBUG_PORT } from "./config.mjs";

const route = process.argv[2] ?? "#!/timesheets/my";
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("index.aspx")) ?? pages[0];
await page.evaluate((r) => (location.hash = r), route);
await new Promise((r) => setTimeout(r, 4000));
console.log(page.url());
await browser.disconnect();
