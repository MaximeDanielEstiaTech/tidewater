// Makes the MCP server and its tools. server.mjs attaches the stdio transport.
// Tests give fake operations (deps.ops) and a fake page (deps.getPage), so they do not need Chrome.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAppPage } from "./browser.mjs";
import { listTimesheets, getTimesheet, fillMonth, submitTimesheet } from "./tidewater.mjs";
import { DEFAULT_TASKS, MAX_HOURS_PER_DAY } from "./config.mjs";
import { timesheetListOutput, timesheetOutput, fillMonthOutput, submitOutput } from "./schemas.mjs";

const REAL_OPS = { listTimesheets, getTimesheet, fillMonth, submitTimesheet };

const asResult = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  structuredContent: value,
});
// Gives only the message, never the stack.
const asError = (err) => ({ content: [{ type: "text", text: String(err?.message ?? err) }], isError: true });

export function createServer(deps = {}) {
  const getPage = deps.getPage ?? getAppPage;
  const ops = { ...REAL_OPS, ...deps.ops };
  const server = new McpServer({ name: "tidewater", version: "0.3.0" });

  // All tools use the same browser page, so only one call at a time runs.
  // A call that the client cancels while it waits does not run.
  let queue = Promise.resolve();
  const run = (signal, fn) => {
    const job = queue.then(async () => {
      signal?.throwIfAborted();
      return fn(await getPage());
    });
    queue = job.catch(() => {});
    return job.then(asResult, asError);
  };

  server.registerTool(
    "list_timesheets",
    {
      title: "List my timesheets",
      description:
        "Lists the timesheets (feuilles de temps) of the signed-in user: ID, month, total hours and status. " +
        "Use it to find the ID of a timesheet, or to see which months already have a timesheet.",
      inputSchema: {},
      outputSchema: timesheetListOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (_args, extra) => run(extra.signal, async (page) => ({ timesheets: await ops.listTimesheets(page) })),
  );

  server.registerTool(
    "get_timesheet",
    {
      title: "Read one timesheet",
      description:
        "Reads one saved timesheet of the signed-in user: month, status, total hours, and the hours and days of each task. " +
        "Use the ID from list_timesheets. The tool refuses a timesheet of another user.",
      inputSchema: {
        id: z.number().int().positive().describe("Timesheet ID, from list_timesheets"),
      },
      outputSchema: timesheetOutput,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ id }, extra) => run(extra.signal, (page) => ops.getTimesheet(page, id)),
  );

  server.registerTool(
    "fill_month",
    {
      title: "Fill and save a monthly timesheet",
      description:
        "Creates a timesheet for one month. It selects '<month> <year>' in 'Informations générales', " +
        "then fills 'Détails de la feuille de temps': each working day (Monday to Friday, not public holidays, not locked days, not daysOff) gets hoursPerDay hours, " +
        `distributed evenly across the tasks. Default tasks: ${DEFAULT_TASKS.join(" | ")}. ` +
        "With save=false (default) it only fills the form (preview). Show the preview to the user first. " +
        "With save=true it clicks 'Enregistrer'; the app saves the timesheet as a draft. " +
        "This tool never submits the timesheet. After a save, show the summary to the user (period, total, hours and days per task, " +
        "skipped holidays, locked days), ask the user to examine the timesheet in Chrome, and ask if they want to submit it. " +
        "Call submit_timesheet only after the user says yes. " +
        "Only the current month and earlier months are available. The tool refuses a month that already has a timesheet.",
      inputSchema: {
        month: z.union([z.number().int().min(1).max(12), z.string()]).describe("Month number 1-12, or a French or English month name"),
        year: z.number().int().min(2018).max(2100).describe("Year with four digits, for example 2026"),
        save: z.boolean().default(false).describe("false = preview only (default); true = click 'Enregistrer' (draft)"),
        mode: z
          .enum(["rotate", "split"])
          .default("rotate")
          .describe("rotate = each day goes fully to one task, in turn (as in earlier months); split = each day is divided across all tasks"),
        hoursPerDay: z
          .number()
          .positive()
          .max(MAX_HOURS_PER_DAY)
          .default(MAX_HOURS_PER_DAY)
          .describe(`Hours on each working day, more than 0 and not more than ${MAX_HOURS_PER_DAY}`),
        daysOff: z.array(z.number().int().min(1).max(31)).default([]).describe("Days of the month with no work (for example leave)"),
        tasks: z.array(z.string()).optional().describe("'Project > Task' texts. Leave empty to use the default four tasks"),
      },
      outputSchema: fillMonthOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    (args, extra) =>
      run(extra.signal, async (page) => {
        const result = await ops.fillMonth(page, { ...args, signal: extra.signal });
        if (result.saved) {
          result.nextStep =
            `Ask the user to confirm that timesheet ${result.id} is correct and if they want to submit it. ` +
            `If yes, call submit_timesheet with id=${result.id} and confirm=true.`;
        }
        return result;
      }),
  );

  server.registerTool(
    "submit_timesheet",
    {
      title: "Submit a timesheet for approval",
      description:
        "Submits a saved timesheet (status Draft or Rejected) for approval: it clicks 'Soumettre', then 'Ok'. " +
        "The user cannot undo this. Call it only after the user has examined the timesheet and has explicitly said to submit it. " +
        "Set confirm=true to show that the user agreed. With dryRun=true, the tool opens the timesheet and finds the button, but does not click it.",
      inputSchema: {
        id: z.number().int().positive().describe("ID of the timesheet to submit, from list_timesheets or fill_month"),
        confirm: z.boolean().describe("Must be true. Set it only when the user has explicitly agreed to submit this timesheet"),
        dryRun: z.boolean().default(false).describe("true = find the 'Soumettre' button but do not click it"),
      },
      outputSchema: submitOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    ({ id, confirm, dryRun }, extra) => {
      if (!dryRun && confirm !== true) {
        return asError("The tool did not submit. Ask the user to confirm, then call again with confirm=true.");
      }
      return run(extra.signal, (page) => ops.submitTimesheet(page, { id, dryRun, signal: extra.signal }));
    },
  );

  return server;
}
