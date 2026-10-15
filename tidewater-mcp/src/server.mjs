#!/usr/bin/env node
// MCP server for the timesheet app. It controls a visible Chrome with puppeteer.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getAppPage } from "./browser.mjs";
import { listTimesheets, getTimesheet, fillMonth, submitTimesheet } from "./tidewater.mjs";
import { DEFAULT_TASKS, MAX_HOURS_PER_DAY } from "./config.mjs";

const server = new McpServer({ name: "tidewater", version: "0.2.0" });

const asText = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const asError = (err) => ({ content: [{ type: "text", text: String(err?.message ?? err) }], isError: true });

server.registerTool(
  "list_timesheets",
  {
    title: "List my timesheets",
    description: "Lists the timesheets (feuilles de temps) of the signed-in user: ID, month, total hours and status.",
    inputSchema: {},
  },
  async () => {
    try {
      return asText(await listTimesheets(await getAppPage()));
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  "get_timesheet",
  {
    title: "Read one timesheet",
    description: "Reads one saved timesheet: month, status, total hours, and the hours and days of each task.",
    inputSchema: { id: z.number().int().positive() },
  },
  async ({ id }) => {
    try {
      return asText(await getTimesheet(await getAppPage(), id));
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  "fill_month",
  {
    title: "Fill and save a monthly timesheet",
    description:
      "Creates a timesheet for one month. It selects '<month> <year>' in 'Informations générales', " +
      "then fills 'Détails de la feuille de temps': each working day (Monday to Friday, not public holidays, not daysOff) gets hoursPerDay hours, " +
      `distributed evenly across the tasks. Default tasks: ${DEFAULT_TASKS.join(" | ")}. ` +
      "With save=true (default) it clicks 'Enregistrer'; the app saves the timesheet as a draft. With save=false it only fills the form (preview). " +
      "This tool never submits the timesheet. After a save, show the summary to the user (period, total, hours and days per task, " +
      "skipped holidays, locked days),ask the user to examine the timesheet in Chrome, and ask if they want to submit it. " +
      "Call submit_timesheet only after the user says yes. " +
      "Only the current month and earlier months are available. The tool refuses a month that already has a timesheet.",
    inputSchema: {
      month: z.union([z.number().int().min(1).max(12), z.string()]).describe("Month number 1-12, or a French or English month name"),
      year: z.number().int().min(2018).max(2100),
      save: z.boolean().default(true).describe("true = click 'Enregistrer' (draft); false = preview only"),
      mode: z
        .enum(["rotate", "split"])
        .default("rotate")
        .describe("rotate = each day goes fully to one task, in turn (as in earlier months); split = each day is divided across all tasks"),
      hoursPerDay: z.number().positive().max(MAX_HOURS_PER_DAY).default(MAX_HOURS_PER_DAY),
      daysOff: z.array(z.number().int().min(1).max(31)).default([]).describe("Days of the month with no work (for example leave)"),
      tasks: z.array(z.string()).optional().describe("'Project > Task' texts. Leave empty to use the default four tasks"),
    },
  },
  async (args) => {
    try {
      const result = await fillMonth(await getAppPage(), args);
      if (result.saved) {
        result.nextStep =
          `Ask the user to confirm that timesheet ${result.id} is correct and if they want to submit it. ` +
          `If yes, call submit_timesheet with id=${result.id} and confirm=true.`;
      }
      return asText(result);
    } catch (err) {
      return asError(err);
    }
  },
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
      id: z.number().int().positive(),
      confirm: z.boolean().describe("Must be true. Set it only when the user has explicitly agreed to submit this timesheet"),
      dryRun: z.boolean().default(false).describe("true = find the 'Soumettre' button but do not click it"),
    },
  },
  async ({ id, confirm, dryRun }) => {
    if (!dryRun && confirm !== true) {
      return asError("The tool did not submit. Ask the user to confirm, then call again with confirm=true.");
    }
    try {
      return asText(await submitTimesheet(await getAppPage(), { id, dryRun }));
    } catch (err) {
      return asError(err);
    }
  },
);

await server.connect(new StdioServerTransport());
