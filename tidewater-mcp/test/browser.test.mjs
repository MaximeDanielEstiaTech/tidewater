// Tests the start of Chrome. They need Chrome, but not a sign-in.
// They use a separate debug port and a temporary profile, so they do not touch the Chrome of the user.
// Run: npm run test:live
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const PORT = 9333;
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "tidewater-test-profile-"));
const browserModule = fileURLToPath(new URL("../src/browser.mjs", import.meta.url));

after(async () => {
  // Close the test Chrome with the DevTools protocol.
  try {
    const b = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}` });
    await b.close();
  } catch {
    // No test Chrome is open.
  }
  // Chrome releases the profile files some time after it closes. A folder in the temp directory is not a problem.
  try {
    fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  } catch {
    console.log(`Could not remove ${PROFILE}`);
  }
});

test("a_process_that_starts_chrome_can_end_and_chrome_stays_open", async () => {
  // A child process starts Chrome with getBrowser(), disconnects and must end.
  const script = `
    const { getBrowser } = await import(${JSON.stringify("file:///" + browserModule.replace(/\\/g, "/"))});
    const b = await getBrowser();
    await b.disconnect();
    console.log("disconnected");
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, WTP_DEBUG_PORT: String(PORT), WTP_PROFILE_DIR: PROFILE },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));

  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill();
      resolve("timeout");
    }, 45_000);
    child.on("exit", (c) => {
      clearTimeout(timer);
      resolve(c);
    });
  });
  assert.equal(code, 0, `the process did not end correctly (${code}): ${out}`);
  assert.match(out, /disconnected/);

  // Chrome is still open on the port.
  const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
  assert.ok(res.ok);
});
