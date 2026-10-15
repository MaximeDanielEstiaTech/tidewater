// Finds the failures that probably come from a change in the WorkTimePro app (UI or data).
// For these failures, the server gives an error that starts with "UI_CHANGED" and
// saves a screenshot and the page HTML as evidence.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EVIDENCE_DIR = fileURLToPath(new URL("../explore/out/ui-errors/", import.meta.url));

export class UiChangeError extends Error {
  constructor(step, detail, evidence) {
    super(
      `UI_CHANGED: step "${step}" failed. The WorkTimePro app possibly changed. ${detail}` +
        (evidence ? ` Evidence: URL ${evidence.url}, screenshot ${evidence.screenshot}, HTML ${evidence.html}` : ""),
    );
    this.name = "UiChangeError";
    this.step = step;
    this.evidence = evidence;
  }
}

// A puppeteer timeout, or a script error in the page (missing element, Angular scope or function).
// A network failure is not a UI change.
function isUiFailure(err) {
  const text = `${err?.message}\n${err?.stack}`;
  if (/Failed to fetch|NetworkError|net::ERR_/.test(text)) return false;
  if (err?.name === "TimeoutError") return true;
  return /\b(TypeError|ReferenceError)\b|Cannot read propert|is not a function|is not defined|of undefined|of null/.test(text);
}

// Saves the evidence and returns a UiChangeError. The caller throws it.
export async function uiChanged(page, step, detail) {
  let evidence = null;
  try {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = path.join(EVIDENCE_DIR, `${stamp}-${step.replace(/[^a-z0-9]+/gi, "-")}`);
    await page.screenshot({ path: `${base}.png`, fullPage: true });
    fs.writeFileSync(`${base}.html`, await page.content());
    evidence = { url: page.url(), screenshot: `${base}.png`, html: `${base}.html` };
  } catch {
    // The evidence is optional. Keep the original error.
  }
  return new UiChangeError(step, detail, evidence);
}

// Runs one step in the app. If the step fails because the app changed, it throws a UiChangeError.
// Other errors (for example "the timesheet does not exist") go through unchanged.
export async function uiStep(page, step, fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof UiChangeError || !isUiFailure(err)) throw err;
    throw await uiChanged(page, step, err.message);
  }
}
