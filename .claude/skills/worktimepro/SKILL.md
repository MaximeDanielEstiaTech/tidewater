---
name: worktimepro
description: Fill the WorkTimePro timesheet ("feuille de temps") of the current month with the tidewater MCP server, then ask the user for permission before it is submitted. Use when the user asks to fill, make or do the timesheet, worksheet or WorkTimePro for this month, or types /worktimepro.
---

# WorkTimePro: timesheet of the current month

Use the tools of the `tidewater` MCP server (`mcp__tidewater__*`). Refer to `tidewater-mcp/README.md` for the details of each tool.

## Rules

- **Do not submit without permission.** Call `submit_timesheet` only after the user explicitly says "yes" (or equivalent) to the submit question in step 6. Approval of the preview or of the save is not approval to submit. A submit is permanent.
- Write all text in ASD-STE100 (refer to `CLAUDE.md`).
- After a fatal error or an unexpected output from a tidewater tool, write a log file in `tidewater-mcp/issue/` before you do a different action (refer to the "MCP tool usage" rule in `CLAUDE.md`). The README section "Usual refusals" lists the errors that are not fatal.

## Procedure

1. **Find the month.** Use today's date to get the current month and year. If the user gives arguments (for example days off, hours per day, mode or tasks), use them.

2. **Check the existing timesheets.** Call `list_timesheets`.
   - If the current month has no timesheet, go to step 3.
   - If the current month has a timesheet with status "Draft" or "Rejected", tell the user. Call `get_timesheet` and show the summary. Then go to step 6 (do not make a new timesheet). If the user wants to make the month again, call `delete_timesheet` with `confirm: true` only after the user explicitly agrees to delete it (a deletion is permanent). Then go to step 3.
   - If the current month has a timesheet with a different status (for example "Submitted" or "Approved"), tell the user and stop.

3. **Ask for the days off.** If the user did not give them, ask the user if they had days with no work this month (for example leave). Use the defaults for all other parameters (7.33 hours per day, mode `rotate`, the four default tasks), unless the user gives other values.

4. **Make a preview.** Call `fill_month` with `month`, `year`, `daysOff` and `save: false`. Show the summary to the user in a table: period, total hours, hours and days for each task, skipped public holidays, locked days, days off. Make sure that the total agrees with the working days × hours per day. If not, it is an unexpected output: write a log file.
   Ask the user if the preview is correct and if you can save it as a draft. If the user wants changes, make a new preview with the changed parameters.

5. **Save as a draft.** When the user agrees, call `fill_month` again with the same parameters and `save: true`. Get the timesheet ID from the result (if the result has no ID, call `list_timesheets`). Show the summary of the saved draft.

6. **Ask for permission to submit.** Tell the user to examine the timesheet in the Chrome window. Then use `AskUserQuestion` to ask: "Do you want to submit the timesheet of <month> <year> (ID <id>, <total> h) for approval? You cannot undo this." Give the options "Submit now" and "Keep as draft".
   - If the user selects "Keep as draft" or does not clearly agree, stop. Tell the user that the timesheet stays as a draft and give the ID.
   - If the user selects "Submit now", go to step 7.

7. **Submit.** Call `submit_timesheet` with `id` and `confirm: true`. Then call `get_timesheet` and make sure that the status changed. Tell the user the new status. If the app returns a warning (for example too many hours), show the warning and stop.
