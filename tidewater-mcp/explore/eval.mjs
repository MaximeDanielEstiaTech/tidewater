// Connects to the Chrome that launch.mjs opened and runs a JavaScript file in the app page.
// The file must contain one expression or an async function body that returns a JSON-serializable value.
// Usage: node explore/eval.mjs path/to/snippet.js
import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { DEBUG_PORT } from "./config.mjs";

const code = fs.readFileSync(process.argv[2], "utf8");
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("index.aspx")) ?? pages[0];
const result = await page.evaluate(`(async () => { ${code} })()`);
console.log(JSON.stringify(result, null, 2));
await browser.disconnect();
