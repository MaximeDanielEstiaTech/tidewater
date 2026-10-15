// Connects to the Chrome that launch.mjs opened and clicks the first visible element with this exact text.
// Usage: node explore/click.mjs "Détails de la feuille de temps"
import puppeteer from "puppeteer-core";
import { DEBUG_PORT } from "./config.mjs";

const text = process.argv[2];
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("index.aspx")) ?? pages[0];
const ok = await page.evaluate((t) => {
  const els = [...document.querySelectorAll("a, button, li, span, td, div")].filter(
    (e) => e.innerText?.trim() === t && e.getBoundingClientRect().width > 0,
  );
  const el = els[els.length - 1];
  if (!el) return false;
  el.click();
  return true;
}, text);
await new Promise((r) => setTimeout(r, 3000));
console.log(ok ? `Clicked "${text}"` : `Not found: "${text}"`);
await browser.disconnect();
