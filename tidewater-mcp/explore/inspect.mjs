// Connects to the Chrome that launch.mjs opened and saves a snapshot of the app page:
// screenshot, HTML, visible text and a list of the interactive elements.
// Usage: node explore/inspect.mjs [label]
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { DEBUG_PORT, OUT_DIR } from "./config.mjs";

const label = process.argv[2] ?? new Date().toISOString().replace(/[:.]/g, "-");
const dir = path.join(OUT_DIR, "snapshots", label);
fs.mkdirSync(dir, { recursive: true });

const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: null });
const pages = await browser.pages();
const page = pages.find((p) => p.url().includes("WorkTimePro") || p.url().includes("index.aspx")) ?? pages[0];

await page.screenshot({ path: path.join(dir, "page.png") });
fs.writeFileSync(path.join(dir, "page.html"), await page.content());

const info = await page.evaluate(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const describe = (el) => ({
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    cls: el.className && typeof el.className === "string" ? el.className.slice(0, 120) : undefined,
    text: (el.innerText || el.value || el.getAttribute("aria-label") || el.title || "").trim().slice(0, 80) || undefined,
    type: el.getAttribute("type") || undefined,
    name: el.getAttribute("name") || undefined,
    ngModel: el.getAttribute("ng-model") || undefined,
    ngClick: el.getAttribute("ng-click") || undefined,
    href: el.getAttribute("href") || undefined,
  });
  const sel = "a, button, input, select, textarea, [ng-click], [role=button], [role=tab], [role=menuitem]";
  return {
    url: location.href,
    title: document.title,
    angular: typeof window.angular !== "undefined" ? window.angular.version?.full : null,
    text: document.body.innerText.slice(0, 15000),
    elements: [...document.querySelectorAll(sel)].filter(visible).map(describe),
  };
});

fs.writeFileSync(path.join(dir, "info.json"), JSON.stringify(info, null, 2));
console.log(`URL: ${info.url}\nTitle: ${info.title}\nAngular: ${info.angular}\nElements: ${info.elements.length}\nSaved to: ${dir}`);
await browser.disconnect();
