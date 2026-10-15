// The output schemas of the tools. The server sends the results as structuredContent,
// and the client validates them with these schemas.
import { z } from "zod";

const timesheetSummary = z.object({
  id: z.number().int(),
  period: z.string(),
  year: z.number().int(),
  periodStart: z.string().describe("First day of the month, YYYY-MM-DD"),
  totalHours: z.number(),
  status: z.string().describe("For example Draft, Submitted, Approved, Rejected"),
});

export const timesheetListOutput = z.object({ timesheets: z.array(timesheetSummary) });

export const timesheetOutput = timesheetSummary.extend({
  tasks: z.array(z.object({ task: z.string(), hours: z.number(), days: z.array(z.number().int()) })),
});

export const fillMonthOutput = z.object({
  saved: z.boolean(),
  id: z.number().int().optional().describe("Only after a save"),
  status: z.string().optional().describe("Only after a save"),
  storedTotal: z.number().optional().describe("Only after a save"),
  period: z.string(),
  mode: z.enum(["rotate", "split"]),
  hoursPerDay: z.number(),
  workDays: z.number().int(),
  holidaysSkipped: z.array(z.number().int()),
  lockedDays: z.array(z.number().int()),
  daysOffSkipped: z.array(z.number().int()),
  timeOffInApp: z.array(z.unknown()),
  expectedTotal: z.number(),
  formTotal: z.number(),
  perTask: z.array(z.object({ task: z.string(), hours: z.number(), days: z.number().int() })),
  nextStep: z.string().optional().describe("Only after a save: what to do next"),
});

export const submitOutput = z.object({
  submitted: z.boolean(),
  dryRun: z.boolean().optional(),
  buttonFound: z.string().optional().describe("Only in a dry run: the text of the button"),
  timesheet: timesheetOutput,
});
