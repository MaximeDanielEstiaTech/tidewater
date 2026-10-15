// Unit tests. They do not need Chrome or the app.
// Run: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseMonth, distribute, classifyDays, checkOwner, TimesheetError, fillMonth, submitTimesheet } from "../src/tidewater.mjs";
import { DEFAULT_TASKS, MAX_HOURS_PER_DAY } from "../src/config.mjs";

const round2 = (n) => Math.round(n * 100) / 100;
const sum = (values) => round2(values.reduce((a, b) => a + b, 0));

describe("parseMonth", () => {
  test("numbers", () => {
    assert.equal(parseMonth(1), 1);
    assert.equal(parseMonth(12), 12);
    assert.equal(parseMonth("10"), 10);
  });
  test("French names, with and without accents", () => {
    assert.equal(parseMonth("octobre"), 10);
    assert.equal(parseMonth("Février"), 2);
    assert.equal(parseMonth("fevrier"), 2);
    assert.equal(parseMonth("août"), 8);
    assert.equal(parseMonth(" Décembre "), 12);
  });
  test("English names and short names", () => {
    assert.equal(parseMonth("October"), 10);
    assert.equal(parseMonth("oct"), 10);
    assert.equal(parseMonth("juil"), 7);
    assert.equal(parseMonth("sept"), 9);
  });
  test("incorrect values", () => {
    for (const bad of [0, 13, "0", "13", "", "xy", "foo"]) {
      assert.throws(() => parseMonth(bad), /Unknown month/, `value ${JSON.stringify(bad)}`);
    }
  });
});

describe("distribute", () => {
  // The weekdays of October 2026.
  const days =[1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29, 30];

  for (const mode of ["rotate", "split"]) {
    test(`${mode}: total is work days x hours per day`, () => {
      const rows = distribute(days, DEFAULT_TASKS, MAX_HOURS_PER_DAY, mode);
      const total = sum(rows.flatMap((r) => Object.values(r.days)));
      assert.equal(total, round2(days.length * MAX_HOURS_PER_DAY));
    });

    test(`${mode}: each day has exactly hoursPerDay`, () => {
      const rows = distribute(days, DEFAULT_TASKS, MAX_HOURS_PER_DAY, mode);
      for (const d of days) {
        assert.equal(sum(rows.map((r) => r.days[d] ?? 0)), MAX_HOURS_PER_DAY, `day ${d}`);
      }
    });

    test(`${mode}: no work on days that are not work days`, () => {
      const rows = distribute(days, DEFAULT_TASKS, MAX_HOURS_PER_DAY, mode);
      const used = new Set(rows.flatMap((r) => Object.keys(r.days).map(Number)));
      assert.deepEqual([...used].sort((a, b) => a - b), days);
    });
  }

  test("rotate: each day goes to one task, and task totals differ by one day at most", () => {
    const rows = distribute(days, DEFAULT_TASKS, MAX_HOURS_PER_DAY, "rotate");
    for (const d of days) assert.equal(rows.filter((r) => d in r.days).length, 1, `day ${d}`);
    const counts = rows.map((r) => Object.keys(r.days).length);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `counts ${counts}`);
  });

  test("rotate: the result agrees with timesheet 1425 (October 2026, made by the tool)", () => {
    const rows = distribute(days, DEFAULT_TASKS, MAX_HOURS_PER_DAY, "rotate");
    assert.deepEqual(rows.map((r) => round2(sum(Object.values(r.days)))), [43.98, 43.98, 36.65, 36.65]);
    assert.deepEqual(Object.keys(rows[0].days).map(Number), [1, 7, 13, 19, 23, 29]);
  });

  test("split: task totals differ by 0.01 h per day at most", () => {
    const rows = distribute(days, DEFAULT_TASKS, MAX_HOURS_PER_DAY, "split");
    const totals = rows.map((r) => sum(Object.values(r.days)));
    assert.ok(round2(Math.max(...totals) - Math.min(...totals)) <= round2(days.length * 0.01), `totals ${totals}`);
  });

  test("no work days gives empty rows", () => {
    const rows = distribute([], DEFAULT_TASKS, MAX_HOURS_PER_DAY, "rotate");
    assert.equal(rows.length, DEFAULT_TASKS.length);
    for (const r of rows) assert.deepEqual(r.days, {});
  });
});

describe("classifyDays", () => {
  // Makes the grid columns of a month. Options: holiday days, read-only days.
  const columnsFor = (year, month, { holiday = [], readOnly = [] } = {}) => {
    const n = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: n }, (_, i) => {
      const day = i + 1;
      return { day, holiday: holiday.includes(day), readOnly: readOnly.includes(day) || holiday.includes(day) };
    });
  };

  test("a normal month: weekdays are work days, weekends are ignored", () => {
    const r = classifyDays({ days: columnsFor(2026, 9) }, 2026, 9);
    assert.equal(r.workDays.length, 22);
    assert.deepEqual(r.holidays, []);
    assert.deepEqual(r.locked, []);
  });

  test("May 2026: public holidays", () => {
    const r = classifyDays({ days: columnsFor(2026, 5, { holiday: [1, 8, 14, 25] }) }, 2026, 5);
    assert.deepEqual(r.holidays, [1, 8, 14, 25]);
    assert.equal(r.workDays.length, 17);
    assert.deepEqual(r.locked, []);
  });

  test("February 2026: a BLOCAGE on the full month gives locked days, not holidays", () => {
    const all = Array.from({ length: 28 }, (_, i) => i + 1);
    const r = classifyDays({ days: columnsFor(2026, 2, { holiday: all }), blockedDays: all }, 2026, 2);
    assert.deepEqual(r.holidays, []);
    assert.equal(r.locked.length, 20);
    assert.deepEqual(r.workDays, []);
  });

  test("a read-only day that is not a holiday is locked", () => {
    const r = classifyDays({ days: columnsFor(2026, 9, { readOnly: [1, 2] }) }, 2026, 9);
    assert.deepEqual(r.locked, [1, 2]);
    assert.ok(!r.workDays.includes(1));
  });

  test("a BLOCAGE and a holiday in the same month", () => {
    const r = classifyDays(
      { days: columnsFor(2026, 5, { holiday: [1, 4, 5, 8] }), blockedDays: [4, 5] },
      2026,
      5,
    );
    assert.deepEqual(r.holidays, [1, 8]);
    assert.deepEqual(r.locked, [4, 5]);
  });

  test("daysOff are not work days, and not holidays or locked days", () => {
    const r = classifyDays({ days: columnsFor(2026, 9) }, 2026, 9, new Set([7, 8, 12]));
    assert.equal(r.workDays.length, 20);
    assert.ok(!r.workDays.includes(7) && !r.workDays.includes(8));
    assert.deepEqual(r.holidays, []);
    assert.deepEqual(r.locked, []);
  });
});

describe("cancellation", () => {
  // A page that fails on each use. The functions must stop before they use it.
  const untouchable = new Proxy({}, { get: (_t, prop) => { throw new Error(`page.${String(prop)} was used`); } });
  const aborted = () => AbortSignal.abort();

  test("fillMonth stops before it uses the page", async () => {
    await assert.rejects(fillMonth(untouchable, { month: 11, year: 2026, signal: aborted() }), { name: "AbortError" });
  });

  test("submitTimesheet stops before it uses the page", async () => {
    await assert.rejects(submitTimesheet(untouchable, { id: 1425, signal: aborted() }), { name: "AbortError" });
  });
});

describe("checkOwner", () => {
  test("accepts a timesheet of the current user", () => {
    assert.doesNotThrow(() => checkOwner({ id: 1425, requesterId: 77 }, 77));
  });

  test("refuses a timesheet of another user with the code NOT_OWNER", () => {
    assert.throws(
      () => checkOwner({ id: 1425, requesterId: 12 }, 77),
      (err) => err instanceof TimesheetError && err.code === "NOT_OWNER" && /list_timesheets/.test(err.message),
    );
  });

  test("refuses a timesheet with no requester", () => {
    assert.throws(() => checkOwner({ id: 1425, requesterId: null }, 77), (err) => err.code === "NOT_OWNER");
  });

  test("the error does not give data of the timesheet", () => {
    try {
      checkOwner({ id: 1425, requesterId: 12, totalHours: 99.5 }, 77);
    } catch (err) {
      assert.doesNotMatch(err.message, /99\.5|\b12\b/);
    }
  });
});
