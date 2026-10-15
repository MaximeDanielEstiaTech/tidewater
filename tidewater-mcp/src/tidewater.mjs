// Operations on the timesheet app. The functions use the forms and the save logic of the app,
// so the app does its usual validation and calculation of totals.
import { LIST_DATA_URL, MAX_HOURS_PER_DAY, DEFAULT_TASKS, MONTHS_FR, MONTHS_EN } from "./config.mjs";
import { uiStep, uiChanged } from "./ui-errors.mjs";

const CREATE_ROUTE = "#!/timesheets/create/";

// Accepts 1-12, "10", "octobre", "October", "oct".
export function parseMonth(month) {
  if (typeof month === "number" || /^\d+$/.test(String(month))) {
    const n = Number(month);
    if (n >= 1 && n <= 12) return n;
  } else {
    const m = String(month).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const plain = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const list of [MONTHS_FR, MONTHS_EN]) {
      const i = list.findIndex((name) => plain(name) === m || (m.length >= 3 && plain(name).startsWith(m)));
      if (i >= 0) return i + 1;
    }
  }
  throw new Error(`Unknown month: "${month}". Use 1-12 or a month name.`);
}

export async function listTimesheets(page) {
  return uiStep(page, "list timesheets", () => page.evaluate(async (base) => {
    const root = angular.element(document.body).injector().get("$rootScope");
    const url =
      `${base}/LTimesheets?$select=Id,Period,Year,PeriodStart,TotalHours,Status` +
      `&$filter=RequesterId eq ${root.CurrentUser.Id}&$orderby=Id desc&$top=100`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, credentials: "include" });
    if (!res.ok) throw new Error(`LTimesheets request failed: HTTP ${res.status}`);
    const json = await res.json();
    const rows = Array.isArray(json.d) ? json.d : json.d.results;
    return rows.map((r) => ({
      id: r.Id,
      period: r.Period,
      year: Number(r.Year),
      periodStart: new Date(Number(/\d+/.exec(r.PeriodStart)[0])).toISOString().slice(0, 10),
      totalHours: Number(r.TotalHours),
      status: r.Status,
    }));
  }, LIST_DATA_URL));
}

// Reads one timesheet from the LTimesheets list, with the hours of each task.
export async function getTimesheet(page, id) {
  return uiStep(page, "read timesheet", () => page.evaluate(
    async (base, id) => {
      const res = await fetch(`${base}/LTimesheets(${Number(id)})`, { headers: { Accept: "application/json" }, credentials: "include" });
      if (res.status === 404) throw new Error(`Timesheet ${id} does not exist.`);
      if (!res.ok) throw new Error(`LTimesheets request failed: HTTP ${res.status}`);
      const r = (await res.json()).d;
      const items = JSON.parse(r.TimesheetJSON || "[]").filter((i) => i.TaskWithProject);
      const day = (i) => Object.keys(i).filter((k) => /^Day\d+$/.test(k) && i[k] !== "" && i[k] != null);
      return {
        id: r.Id,
        period: r.Period,
        year: Number(r.Year),
        periodStart: new Date(Number(/\d+/.exec(r.PeriodStart)[0])).toISOString().slice(0, 10),
        status: r.Status,
        totalHours: Number(r.TotalHours),
        tasks: items.map((i) => ({
          task: i.TaskWithProject,
          hours: Math.round(Number(i.TotalHours) * 100) / 100,
          days: day(i).map((k) => Number(k.slice(3))).sort((a, b) => a - b),
        })),
      };
    },
    LIST_DATA_URL,
    id,
  ));
}

// The statuses that let the requester submit a timesheet (the app shows "Soumettre" only for them).
const SUBMITTABLE = ["Draft", "Rejected"];

/**
 * Submits a saved timesheet for approval: it clicks "Soumettre", then "Ok" in the confirmation dialog.
 * With dryRun=true, the function opens the timesheet and finds the button, but does not click it.
 */
export async function submitTimesheet(page, { id, dryRun = false }) {
  const before = await getTimesheet(page, id);
  if (!SUBMITTABLE.includes(before.status)) {
    throw new Error(`Timesheet ${id} has status "${before.status}". You can submit only a timesheet with status ${SUBMITTABLE.join(" or ")}.`);
  }

  await page.evaluate((id) => (location.hash = `#!/timesheets/view/${id}`), id);
  const found = await page
    .waitForFunction(
      () => [...document.querySelectorAll("button")].some((b) => b.getAttribute("ng-click") === "submitRequest()" && b.offsetParent),
      { timeout: 20_000, polling: 300 },
    )
    .then(() => true, () => false);
  // The status permits a submission, so a missing button means that the page changed.
  if (!found) {
    throw await uiChanged(page, "find Soumettre", `The "Soumettre" button (ng-click="submitRequest()") is not on the page of timesheet ${id}.`);
  }
  const label = await page.evaluate(() =>
    [...document.querySelectorAll("button")].find((b) => b.getAttribute("ng-click") === "submitRequest()").innerText.trim(),
  );

  if (dryRun) return { submitted: false, dryRun: true, buttonFound: label, timesheet: before };

  // 1. Click "Soumettre". 2. Click "Ok" in the "Are you sure?" dialog.
  await uiStep(page, "click Soumettre then Ok", async () => {
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.getAttribute("ng-click") === "submitRequest()").click());
    await page.waitForFunction(() => document.querySelector('.modal-dialog button[ng-click="ok()"]'), { timeout: 10_000, polling: 200 });
    await page.evaluate(() => document.querySelector('.modal-dialog button[ng-click="ok()"]').click());
  });

  // The app shows a warning if the hours are not in the permitted limits. If not, the status changes.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    const warning = await page.evaluate(() => {
      const el = document.querySelector(".cg-notify-message.alert-warning");
      return el?.offsetParent ? el.innerText.trim() : null;
    });
    if (warning) throw new Error(`The app did not submit timesheet ${id}: ${warning}`);
    const after = await getTimesheet(page, id);
    if (after.status !== before.status) return { submitted: true, timesheet: after };
  }
  throw new Error(`Timesheet ${id} still has status "${before.status}" after 30 s. Examine the page in Chrome.`);
}

// Gives the hours of each working day to the tasks.
// "rotate": each day goes fully to one task, in turn. The task totals differ by one day at most.
// "split": each day is divided across all tasks. The task totals differ by 0.01 h per day at most.
export function distribute(workDays, tasks, hoursPerDay, mode) {
  const rows = tasks.map((task) => ({ task, days: {} }));
  workDays.forEach((day, i) => {
    if (mode === "rotate") {
      rows[i % tasks.length].days[day] = hoursPerDay;
    } else {
      const cents = Math.round(hoursPerDay * 100);
      const base = Math.floor(cents / tasks.length);
      let extra = cents - base * tasks.length;
      // Turn the start of the extra cents so that no task always gets them.
      for (let k = 0; k < tasks.length; k++) {
        const t = (i + k) % tasks.length;
        rows[t].days[day] = (base + (extra-- > 0 ? 1 : 0)) / 100;
      }
    }
  });
  return rows;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Creates the timesheet of one month.
 * With save=true (default), the function clicks "Enregistrer". The app saves the timesheet as a draft.
 * With save=false, the function fills the form in the browser and does not save it (preview).
 * The function does not submit the timesheet. Use submitTimesheet for that.
 */
export async function fillMonth(page, opts) {
  const month = parseMonth(opts.month);
  const year = Number(opts.year);
  const hoursPerDay = opts.hoursPerDay ?? MAX_HOURS_PER_DAY;
  const tasks = opts.tasks?.length ? opts.tasks : DEFAULT_TASKS;
  const mode = opts.mode ?? "rotate";
  const daysOff = new Set((opts.daysOff ?? []).map(Number));
  if (!(hoursPerDay > 0 && hoursPerDay <= MAX_HOURS_PER_DAY)) {
    throw new Error(`hoursPerDay must be more than 0 and not more than ${MAX_HOURS_PER_DAY}.`);
  }
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;

  const existing = (await listTimesheets(page)).filter((t) => t.periodStart === periodStart);
  if (existing.length && !opts.allowDuplicate) {
    const e = existing[0];
    throw new Error(
      `A timesheet for ${periodStart.slice(0, 7)} exists: ID ${e.id}, status ${e.status}, ${e.totalHours} h. ` +
        `The tool did not make a new one.`,
    );
  }

  // 1. Open a new, empty "Créer une feuille de temps" form.
  await page.evaluate((route) => {
    location.hash = "#!/timesheets/my";
    setTimeout(() => (location.hash = route), 300);
  }, CREATE_ROUTE);
  await uiStep(page, "open create form", () => page.waitForFunction(
    () => {
      const el = document.querySelector("hot-table");
      const s = el && angular.element(el).scope()?.$parent?.$parent;
      return location.hash.startsWith("#!/timesheets/create") && s?.formData?.Periods?.length && s.saveTimesheet;
    },
    { timeout: 30_000, polling: 300 },
  ));

  // 2. "Informations générales": select "<month> <year>".
  const periodText = await uiStep(page, "select period", () => page.evaluate((start) => {
    const s = angular.element(document.querySelector("hot-table")).scope().$parent.$parent;
    const p = s.formData.Periods.find((x) => x.PeriodStart === start);
    if (!p) return null;
    s.$apply(() => {
      s.formData.Period = p;
      s.periodOnChange();
    });
    return p.Text;
  }, periodStart));
  if (!periodText) {
    throw new Error(`The app does not let you select ${periodStart.slice(0, 7)}. Only the current month and earlier months are available.`);
  }
  // The app gets the public holidays and then makes the day columns again.
  // Wait until the columns are for the selected month and are stable.
  const mm = `/${String(month).padStart(2, "0")}`;
  await uiStep(page, "load day columns", () => page.waitForFunction((suffix) => {
    const s = angular.element(document.querySelector("hot-table")).scope().$parent.$parent;
    const title = s.handsonTableColumns?.[1]?.title ?? "";
    return title.includes("1" + suffix);
  }, { timeout: 15_000, polling: 200 }, mm));
  await new Promise((r) => setTimeout(r, 2500));

  // 3. "Détails de la feuille de temps": open the tab and fill the grid.
  const tabFound = await page.evaluate(() => {
    const tab = [...document.querySelectorAll("a")].find((a) => a.innerText.trim() === "Détails de la feuille de temps");
    tab?.click();
    return !!tab;
  });
  if (!tabFound) throw await uiChanged(page, "open details tab", `The tab "Détails de la feuille de temps" is not on the page.`);
  await new Promise((r) => setTimeout(r, 800));

  const columns = await uiStep(page, "read grid columns", () => page.evaluate(() => {
    const s = angular.element(document.querySelector("hot-table")).scope().$parent.$parent;
    return {
      days: s.handsonTableColumns
        .filter((c) => /^Day\d+$/.test(c.data))
        .map((c) => ({ day: Number(c.data.slice(3)), readOnly: !!c.readOnly, holiday: /publicHoliday/.test(c.className ?? "") })),
      // The app also uses "public holidays" to lock a period (title "BLOCAGE"). Get the days of these locks.
      blockedDays: (s.formData.PublicHolidayItems ?? [])
        .filter((h) => /blocage/i.test(h.Title ?? ""))
        .flatMap((h) => {
          const fmt = s.$root.SystemSettings.DateFormat;
          const start = moment.utc(h.Start, fmt);
          const end = moment.utc(h.End, fmt);
          const periodStart = moment.utc(s.formData.Period.PeriodStart);
          const days = [];
          for (const d = start.clone(); !d.isAfter(end); d.add(1, "days")) {
            if (d.isSame(periodStart, "month")) days.push(d.date());
          }
          return days;
        }),
      knownTasks: (s.userDefinedTasks ?? []).map((t) => `${t.Project} > ${t.Task}`),
      timeOff: JSON.parse(JSON.stringify(s.formData.TimeOffItems ?? [])),
    };
  }));

  const unknown = tasks.filter((t) => !columns.knownTasks.includes(t));
  if (unknown.length) {
    const hints = unknown.map((u) => {
      const project = u.split(" > ")[0];
      const near = columns.knownTasks.filter((k) => k.startsWith(project + " > "));
      return `"${u}"` + (near.length ? ` (possible: ${near.map((n) => `"${n}"`).join(", ")})` : "");
    });
    throw new Error(`These tasks are not in the app: ${hints.join("; ")}`);
  }

  const holidays = [];
  // Days that the app locks: a "BLOCAGE" item, or a read-only day that is not a public holiday.
  const locked = [];
  const workDays = [];
  const blocked = new Set(columns.blockedDays);
  for (const c of columns.days) {
    const weekday = new Date(Date.UTC(year, month - 1, c.day)).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (blocked.has(c.day) || (c.readOnly && !c.holiday)) locked.push(c.day);
    else if (c.holiday || c.readOnly) holidays.push(c.day);
    else if (!daysOff.has(c.day)) workDays.push(c.day);
  }
  const plan = distribute(workDays, tasks, hoursPerDay, mode);

  await uiStep(page, "fill grid", () => page.evaluate((rows) => {
    const s = angular.element(document.querySelector("hot-table")).scope().$parent.$parent;
    const hot = angular.element(document.querySelector("hot-table")).isolateScope().hotInstance;
    // Remove all rows that the form has now (for example from "Copier de la feuille précédente").
    if (hot.countRows() > 1) hot.alter("remove_row", 0, hot.countRows() - 1);
    const changes = [];
    rows.forEach((row, r) => {
      changes.push([r, "TaskWithProject", row.task]);
      for (const [day, h] of Object.entries(row.days)) changes.push([r, `Day${day}`, h]);
    });
    hot.setDataAtRowProp(changes);
    s.$applyAsync();
  }, plan));
  await new Promise((r) => setTimeout(r, 1500));

  const check = await uiStep(page, "read form totals", () => page.evaluate(() => {
    const s = angular.element(document.querySelector("hot-table")).scope().$parent.$parent;
    const items = s.timesheetItems.filter((i) => i.TaskWithProject);
    return {
      total: Number(s.formData.TotalHours),
      rows: items.map((i) => ({
        task: i.TaskWithProject,
        total: Number(i.TotalHours),
        days: Object.keys(i).filter((k) => /^Day\d+$/.test(k) && i[k] !== "" && i[k] != null).length,
      })),
    };
  }));

  const expectedTotal = round2(workDays.length * hoursPerDay);
  const summary = {
    period: periodText,
    mode,
    hoursPerDay,
    workDays: workDays.length,
    holidaysSkipped: holidays,
    lockedDays: locked,
    daysOffSkipped: [...daysOff].sort((a, b) => a - b),
    timeOffInApp: columns.timeOff,
    expectedTotal,
    formTotal: round2(check.total),
    perTask: check.rows.map((r) => ({ task: r.task, hours: round2(r.total), days: r.days })),
  };
  if (Math.abs(summary.formTotal - expectedTotal) > 0.005 || check.rows.length !== tasks.length) {
    throw new Error(`The form does not agree with the plan. Nothing was saved. ${JSON.stringify(summary)}`);
  }

  if (opts.save === false) return { saved: false, ...summary };
  if (workDays.length === 0) {
    throw new Error(`The month has no work days (locked days: ${locked.join(", ") || "none"}). Nothing was saved.`);
  }

  // 4. Save. The app saves the timesheet as a draft and opens its details page.
  const saveFound = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "Enregistrer");
    btn?.click();
    return !!btn;
  });
  if (!saveFound) throw await uiChanged(page, "find Enregistrer", `The "Enregistrer" button is not on the page. Nothing was saved.`);
  await uiStep(page, "wait for saved timesheet", () =>
    page.waitForFunction(() => /#!\/timesheets\/view\/\d+/.test(location.hash), { timeout: 30_000, polling: 300 }),
  );
  const id = await page.evaluate(() => Number(/view\/(\d+)/.exec(location.hash)[1]));
  const stored = await getTimesheet(page, id);
  return { saved: true, id, status: stored.status, storedTotal: stored.totalHours, ...summary };
}
