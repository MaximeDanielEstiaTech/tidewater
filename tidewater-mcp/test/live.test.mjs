// Live tests on the real app. They need Chrome and a Microsoft sign-in (see README "Sign-in").
// The tests only read, make previews (save=false) and do dry runs (dryRun=true).
// They never save or submit a timesheet. The expected values are in fixtures.json.
// Run: npm run test:live
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getAppPage } from "../src/browser.mjs";
import { listTimesheets, getTimesheet, fillMonth, submitTimesheet } from "../src/tidewater.mjs";
import { timesheetListOutput, timesheetOutput, fillMonthOutput, submitOutput } from "../src/schemas.mjs";

const fx = JSON.parse(fs.readFileSync(new URL("./fixtures.json", import.meta.url), "utf8"));

let page;
let listBefore;

// The only ways that these tests call fillMonth and submitTimesheet.
const preview = (opts) => fillMonth(page, { ...opts, save: false });
const dryRunSubmit = (id) => submitTimesheet(page, { id, dryRun: true });

before(async () => {
  page = await getAppPage();
});
after(async () => {
  await page?.browser().disconnect();
});

describe("read", () => {
  test("list_timesheets includes the approved fixture", async () => {
    listBefore = await listTimesheets(page);
    assert.ok(listBefore.length > 0);
    timesheetListOutput.parse({ timesheets: listBefore });
    const t = listBefore.find((x) => x.id === fx.approved.id);
    assert.ok(t, `timesheet ${fx.approved.id} is not in the list`);
    assert.equal(t.periodStart, fx.approved.periodStart);
    assert.equal(t.status, fx.approved.status);
    assert.equal(t.totalHours, fx.approved.totalHours);
  });

  test("get_timesheet reads the approved fixture", async () => {
    const t = await getTimesheet(page, fx.approved.id);
    timesheetOutput.parse(t);
    assert.equal(t.status, fx.approved.status);
    assert.equal(t.totalHours, fx.approved.totalHours);
    assert.equal(t.tasks.length, fx.approved.tasks);
    const sum = Math.round(t.tasks.reduce((a, x) => a + x.hours, 0) * 100) / 100;
    assert.equal(sum, fx.approved.totalHours);
  });

  test("get_timesheet refuses an ID that does not exist", async () => {
    await assert.rejects(getTimesheet(page, 99999999), /does not exist/);
  });
});

describe("fill_month (preview only)", () => {
  for (const p of fx.previews) {
    test(`preview ${p.year}-${String(p.month).padStart(2, "0")}`, async () => {
      const r = await preview({ month: p.month, year: p.year, allowDuplicate: true });
      fillMonthOutput.parse(r);
      assert.equal(r.saved, false);
      assert.equal(r.workDays, p.workDays);
      assert.deepEqual(r.holidaysSkipped, p.holidays);
      assert.equal(r.lockedDays.length, p.lockedDays);
      assert.equal(r.formTotal, p.total);
      assert.equal(r.formTotal, r.expectedTotal);
    });
  }

  test("a month that has a timesheet is refused", async () => {
    const [year, month] = fx.approved.periodStart.split("-").map(Number);
    await assert.rejects(preview({ month, year }), new RegExp(`ID ${fx.approved.id}`));
  });

  test("an unknown task is refused", async () => {
    const p = fx.previews[0];
    await assert.rejects(
      preview({ month: p.month, year: p.year, allowDuplicate: true, tasks: ["NO PROJECT > no task"] }),
      /not in the app/,
    );
  });
});

describe("submit_timesheet (dry run only)", () => {
  test("an approved timesheet is refused", async () => {
    await assert.rejects(dryRunSubmit(fx.approved.id), /status "Approved"/);
  });

  test("a draft: the Soumettre button is found and not clicked", async (t) => {
    const draft = listBefore.find((x) => x.status === "Draft" || x.status === "Rejected");
    if (!draft) return t.skip("no Draft or Rejected timesheet");
    const r = await dryRunSubmit(draft.id);
    submitOutput.parse(r);
    assert.equal(r.submitted, false);
    assert.equal(r.buttonFound, "Soumettre");
    const after = await getTimesheet(page, draft.id);
    assert.equal(after.status, draft.status);
  });
});

describe("safety", () => {
  test("the tests did not add or change a timesheet", async () => {
    const listAfter = await listTimesheets(page);
    assert.deepEqual(listAfter, listBefore);
  });
});
