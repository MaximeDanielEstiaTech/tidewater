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

// An error that the user or the model can correct. code: NOT_FOUND, NOT_OWNER, BAD_STATUS.
export class TimesheetError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TimesheetError";
    this.code = code;
  }
}

// Refuses a timesheet that is not of the current user. The message gives no data of the timesheet.
export function checkOwner(sheet, currentUserId) {
  if (sheet.requesterId == null || sheet.requesterId !== currentUserId) {
    throw new TimesheetError(
      "NOT_OWNER",
      `Timesheet ${sheet.id} is not one of your timesheets. Use list_timesheets to find your timesheet IDs.`,
    );
  }
}

// Reads one timesheet of the current user from the LTimesheets list, with the hours of each task.
export async function getTimesheet(page, id) {
  const sheet = await uiStep(page, "read timesheet", () => page.evaluate(
    async (base, id) => {
      const res = await fetch(`${base}/LTimesheets(${Number(id)})`, { headers: { Accept: "application/json" }, credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`LTimesheets request failed: HTTP ${res.status}`);
      const r = (await res.json()).d;
      const items = JSON.parse(r.TimesheetJSON || "[]").filter((i) => i.TaskWithProject);
      const day = (i) => Object.keys(i).filter((k) => /^Day\d+$/.test(k) && i[k] !== "" && i[k] != null);
      return {
        currentUserId: angular.element(document.body).injector().get("$rootScope").CurrentUser.Id,
        requesterId: r.RequesterId ?? null,
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
  if (!sheet) {
    throw new TimesheetError("NOT_FOUND", `Timesheet ${id} does not exist. Use list_timesheets to find your timesheet IDs.`);
  }
  const { currentUserId, requesterId, ...result } = sheet;
  checkOwner({ id: sheet.id, requesterId }, currentUserId);
  return result;
}

// The statuses that let the requester submit or delete a timesheet (the app shows "Soumettre" and "Supprimer" only for them).
const EDITABLE = ["Draft", "Rejected"];

// Refuses a timesheet that the requester cannot change. verb: "submit" or "delete".
export function checkStatus(sheet, verb) {
  if (!EDITABLE.includes(sheet.status)) {
    throw new TimesheetError(
      "BAD_STATUS",
      `Timesheet ${sheet.id} has status "${sheet.status}". You can ${verb} only a timesheet with status ${EDITABLE.join(" or ")}.`,
    );
  }
}

// Opens the page of a timesheet and finds the button with this ng-click. Returns the text of the button.
async function openAndFindButton(page, id, ngClick, name) {
  await page.evaluate((id) => (location.hash = `#!/timesheets/view/${id}`), id);
  const found = await page
    .waitForFunction(
      (ngClick) => [...document.querySelectorAll("button")].some((b) => b.getAttribute("ng-click") === ngClick && b.offsetParent),
      { timeout: 20_000, polling: 300 },
      ngClick,
    )
    .then(() => true, () => false);
  // The status permits the action, so a missing button means that the page changed.
  if (!found) {
    throw await uiChanged(page, `find ${name}`, `The "${name}" button (ng-click="${ngClick}") is not on the page of timesheet ${id}.`);
  }
  return page.evaluate(
    (ngClick) => [...document.querySelectorAll("button")].find((b) => b.getAttribute("ng-click") === ngClick).innerText.trim(),
    ngClick,
  );
}

// 1. Clicks the button with this ng-click. 2. Clicks "Ok" in the "Are you sure?" dialog.
async function clickAndConfirm(page, ngClick, name) {
  await uiStep(page, `click ${name} then Ok`, async () => {
    await page.evaluate((ngClick) => [...document.querySelectorAll("button")].find((b) => b.getAttribute("ng-click") === ngClick).click(), ngClick);
    await page.waitForFunction(() => document.querySelector('.modal-dialog button[ng-click="ok()"]'), { timeout: 10_000, polling: 200 });
    await page.evaluate(() => document.querySelector('.modal-dialog button[ng-click="ok()"]').click());
  });
}

/**
 * Submits a saved timesheet for approval: it clicks "Soumettre", then "Ok" in the confirmation dialog.
 * With dryRun=true, the function opens the timesheet and finds the button, but does not click it.
 */
export async function submitTimesheet(page, { id, dryRun = false, signal }) {
  signal?.throwIfAborted();
  const before = await getTimesheet(page, id);
  checkStatus(before, "submit");
  const label = await openAndFindButton(page, id, "submitRequest()", "Soumettre");

  if (dryRun) return { submitted: false, dryRun: true, buttonFound: label, timesheet: before };
  // The last point where a cancellation stops the submission.
  signal?.throwIfAborted();
  await clickAndConfirm(page, "submitRequest()", "Soumettre");

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

/**
 * Deletes a saved timesheet (status Draft or Rejected): it clicks "Supprimer", then "Ok" in the confirmation dialog.
 * With dryRun=true, the function opens the timesheet and finds the button, but does not click it.
 * The function makes sure that the timesheet is not in the list after the deletion.
 */
export async function deleteTimesheet(page, { id, dryRun = false, signal }) {
  signal?.throwIfAborted();
  const before = await getTimesheet(page, id);
  checkStatus(before, "delete");
  const label = await openAndFindButton(page, id, "removeRequest()", "Supprimer");

  if (dryRun) return { deleted: false, dryRun: true, buttonFound: label, timesheet: before };
  // The last point where a cancellation stops the deletion.
  signal?.throwIfAborted();
  await clickAndConfirm(page, "removeRequest()", "Supprimer");

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    const warning = await page.evaluate(() => {
      const el = document.querySelector(".cg-notify-message.alert-warning, .cg-notify-message.alert-danger");
      return el?.offsetParent ? el.innerText.trim() : null;
    });
    if (warning) throw new Error(`The app did not delete timesheet ${id}: ${warning}`);
    const stillThere = (await listTimesheets(page)).some((t) => t.id === id);
    if (!stillThere) return { deleted: true, timesheet: before };
  }
  throw new Error(`Timesheet ${id} is still in the list after 30 s. Examine the page in Chrome.`);
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

// Sorts the weekdays of the month from the grid columns.
// days: [{ day, readOnly, holiday }]. blockedDays: the days of "BLOCAGE" items. daysOff: a Set of days.
// Locked days are "BLOCAGE" days and read-only days that are not public holidays.
export function classifyDays({ days, blockedDays = [] }, year, month, daysOff = new Set()) {
  const holidays = [];
  const locked = [];
  const workDays = [];
  const blocked = new Set(blockedDays);
  for (const c of days) {
    const weekday = new Date(Date.UTC(year, month - 1, c.day)).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (blocked.has(c.day) || (c.readOnly && !c.holiday)) locked.push(c.day);
    else if (c.holiday) holidays.push(c.day);
    else if (!daysOff.has(c.day)) workDays.push(c.day);
  }
  return { holidays, locked, workDays };
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Creates the timesheet of one month.
 * With save=true, the function clicks "Enregistrer". The app saves the timesheet as a draft.
 * Without save=true, the function fills the form in the browser and does not save it (preview).
 * The function does not submit the timesheet. Use submitTimesheet for that.
 */
export async function fillMonth(page, opts) {
  const signal = opts.signal;
  signal?.throwIfAborted();
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
  signal?.throwIfAborted();
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

  const { holidays, locked, workDays } = classifyDays(columns, year, month, daysOff);
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

  if (opts.save !== true) return { saved: false, ...summary };
  if (workDays.length === 0) {
    throw new Error(`The month has no work days (locked days: ${locked.join(", ") || "none"}). Nothing was saved.`);
  }

  // 4. Save. The app saves the timesheet as a draft and opens its details page.
  // The last point where a cancellation stops the save.
  signal?.throwIfAborted();
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
