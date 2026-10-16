# Tidewater MCP server

This MCP server fills the monthly timesheets ("feuilles de temps"). It controls a visible Chrome with puppeteer.

## Installation

Run this command in the `tidewater-mcp` folder:

```
npm install
```

The `.mcp.json` file in the repository root registers the server for Claude Code. Start Claude Code in the repository root and accept the `tidewater` server.

## Sign-in

The server uses a persistent Chrome profile in `%LOCALAPPDATA%\tidewater-mcp\chrome-profile`.
If a Chrome is open on port 9222 (for example from `npm run explore`), the server uses that Chrome. If not, the server starts one. This Chrome stays open when the server, the CLI or the tests stop, so you stay signed in.
To find `chrome.exe`, the server uses `CHROME_PATH` if it is set. If not, it looks in `%PROGRAMFILES%`, `%PROGRAMFILES(X86)%` and `%LOCALAPPDATA%` (folder `Google\Chrome\Application`).

The server does one tool call at a time, because all tools use the same Chrome page. A call that the client cancels while it waits does not run. The tools return their results as `structuredContent`, with an output schema (`src/schemas.mjs`).
If Microsoft asks for a sign-in, sign in in the Chrome window. The server waits for 5 minutes at most.

## Tools

| Tool | Function |
|---|---|
| `list_timesheets` | Lists your timesheets: ID, month, total hours, status. |
| `get_timesheet` | Reads one timesheet: status, total, and the hours and days of each task. |
| `fill_month` | Makes the timesheet of one month: a preview, or a saved draft with `save: true`. |
| `submit_timesheet` | Submits a draft for approval ("Soumettre", then "Ok"). |
| `delete_timesheet` | Deletes a draft or a rejected timesheet ("Supprimer", then "Ok"). |

`fill_month` does these steps:

1. It opens "Créer une feuille de temps".
2. In "Informations générales", it selects "&lt;month&gt; &lt;year&gt;".
3. In "Détails de la feuille de temps", it gives `hoursPerDay` (7.33 max) to each working day. Working days are Monday to Friday. The tool skips public holidays (the app shows them as read-only columns), locked days ("BLOCAGE") and the days in `daysOff`.
4. It distributes the hours evenly across the four tasks:
   - `CYCLE INGENIEUR (CI) > 1ère année`
   - `CYCLE INGENIEUR (CI) > 2ème année`
   - `PANDRONE - ETECH/PANDRO > -`
   - `RECHERCHE SUR FONDS PROPRES > -`
5. Only with `save: true`: it clicks "Enregistrer". The app saves the timesheet as a draft.
6. It returns a summary. Claude then asks you to confirm that the timesheet is correct, and asks if you want to submit it.

`fill_month` parameters:

- `mode`: `rotate` (default) gives each day fully to one task, in turn, as in the earlier months. The task totals differ by one day at most. `split` divides each day across the four tasks.
- `save`: `false` (default) fills the form but does not save it (preview). `true` saves the timesheet as a draft.

`submit_timesheet` does these steps only after you agree:

1. It makes sure that the status is "Draft" or "Rejected".
2. It opens the timesheet and clicks "Soumettre".
3. It clicks "Ok" in the "Are you sure?" dialog.
4. It waits until the status changes. If the app shows a warning (for example, too many hours), the tool returns the warning.

`submit_timesheet` parameters:

- `confirm`: must be `true`. If not, the tool does not submit.
- `dryRun`: `true` opens the timesheet and finds the "Soumettre" button, but does not click it.

`delete_timesheet` does these steps only after you agree:

1. It makes sure that the timesheet is yours and that the status is "Draft" or "Rejected".
2. It opens the timesheet and clicks "Supprimer".
3. It clicks "Ok" in the "Are you sure?" dialog.
4. It waits until the timesheet is not in the list. If the app shows a warning, the tool returns the warning.

`delete_timesheet` parameters:

- `confirm`: must be `true`. If not, the tool does not delete.
- `dryRun`: `true` opens the timesheet and finds the "Supprimer" button, but does not click it.

You cannot undo a deletion.

Limits:

- The app lets you select only the current month and earlier months.
- The tool does not make a timesheet for a month that already has one.

## Usual refusals

The tools give these errors on purpose. They are not fatal errors (refer to the "MCP tool usage" rule in [CLAUDE.md](../CLAUDE.md)). Change the input or ask the user.

| Tool | Error |
|---|---|
| All | Input that the schema refuses (the error gives the name of the field). |
| `get_timesheet`, `submit_timesheet`, `delete_timesheet` | `Timesheet <id> does not exist.` / `Timesheet <id> is not one of your timesheets.` |
| `fill_month` | `Unknown month: ...` |
| `fill_month` | `A timesheet for <YYYY-MM> exists: ...` |
| `fill_month` | `The app does not let you select <YYYY-MM>. Only the current month and earlier months are available.` |
| `fill_month` | `These tasks are not in the app: ...` |
| `fill_month` | `The month has no work days (locked days: ...). Nothing was saved.` |
| `submit_timesheet` | `The tool did not submit. Ask the user to confirm, then call again with confirm=true.` |
| `submit_timesheet` | `Timesheet <id> has status "<status>". You can submit only a timesheet with status Draft or Rejected.` |
| `submit_timesheet` | `The app did not submit timesheet <id>: <warning of the app>` (for example, the hours are not in the limits of the app) |
| `delete_timesheet` | `The tool did not delete. Ask the user to confirm, then call again with confirm=true.` |
| `delete_timesheet` | `Timesheet <id> has status "<status>". You can delete only a timesheet with status Draft or Rejected.` |
| `delete_timesheet` | `The app did not delete timesheet <id>: <warning of the app>` |

All other errors are fatal, for example `UI_CHANGED`, `The form does not agree with the plan`, `LTimesheets request failed: HTTP <code>`, or a sign-in timeout.

## App changes

If a step fails because the WorkTimePro app changed (an element, a text or an Angular scope is missing), the error starts with `UI_CHANGED`. The error gives the step name and the URL. The server also saves a screenshot and the page HTML in `explore/out/ui-errors/`.

Other errors (for example "the timesheet does not exist") do not start with `UI_CHANGED`.

After a fatal error or an unexpected output, Claude writes a log file in `issue/`. Refer to the "MCP tool usage" rule in [CLAUDE.md](../CLAUDE.md).

## Command line

Run these commands in the `tidewater-mcp` folder:

```
node src/cli.mjs list
node src/cli.mjs fill octobre 2026            # preview
node src/cli.mjs fill octobre 2026 --save     # save as draft
node src/cli.mjs fill octobre 2026 --split --days-off=12,13
node src/cli.mjs get 1346
node src/cli.mjs submit 1346                  # dry run: finds the button, does not click
node src/cli.mjs submit 1346 --confirm        # submits
node src/cli.mjs delete 1425                  # dry run: finds the button, does not click
node src/cli.mjs delete 1425 --confirm        # deletes
```

In the CLI, `fill` is a preview unless you add `--save`.

## Tests

```
npm test            # unit tests: no Chrome, less than 1 s
npm run test:live   # tests on the real app: Chrome and a sign-in, approximately 30 s
```

- `test/unit.test.mjs`: `parseMonth`, `distribute`, `classifyDays` (holidays, "BLOCAGE" locks, read-only days, `daysOff`), `checkOwner` and cancellation.
- `test/server.test.mjs`: the tool contract (names, required fields, descriptions, annotations, bounds, output schemas) and the tool behaviour through an in-memory MCP client: results, errors, one call at a time, and cancellation. The server gets fake operations from `createServer({ getPage, ops })`, so these tests do not need Chrome.
- `test/browser.test.mjs`: a process that starts Chrome can end, and Chrome stays open. It uses port 9333 and a temporary profile, so it does not touch your Chrome.
- `test/e2e.test.mjs`: starts `src/server.mjs` over stdio and lists the tools.
- `test/live.test.mjs`: reads, previews (`save: false`) and dry runs (`dryRun: true`) only. These tests never save or submit a timesheet. They check the real results against the output schemas. The last test makes sure that the list of timesheets did not change.
- `test/fixtures.json`: the expected values for the live tests (the approved timesheet and the preview months). If the data in the app changes, update this file.

## Exploration scripts

The `explore/` folder has the scripts that were used to examine the app: `launch.mjs`, `inspect.mjs`, `goto.mjs`, `click.mjs`, `eval.mjs`. The output goes to `explore/out/`.
