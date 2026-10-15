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
If a Chrome is open on port 9222 (for example from `npm run explore`), the server uses that Chrome. If not, the server starts one.
If Microsoft asks for a sign-in, sign in in the Chrome window. The server waits for 5 minutes at most.

## Tools

| Tool | Function |
|---|---|
| `list_timesheets` | Lists your timesheets: ID, month, total hours, status. |
| `get_timesheet` | Reads one timesheet: status, total, and the hours and days of each task. |
| `fill_month` | Makes and saves the timesheet of one month (draft). |
| `submit_timesheet` | Submits a draft for approval ("Soumettre", then "Ok"). |

`fill_month` does these steps:

1. It opens "Créer une feuille de temps".
2. In "Informations générales", it selects "&lt;month&gt; &lt;year&gt;".
3. In "Détails de la feuille de temps", it gives `hoursPerDay` (7.33 max) to each working day. Working days are Monday to Friday. The tool skips public holidays (the app shows them as read-only columns) and the days in `daysOff`.
4. It distributes the hours evenly across the four tasks:
   - `CYCLE INGENIEUR (CI) > 1ère année`
   - `CYCLE INGENIEUR (CI) > 2ème année`
   - `PANDRONE - ETECH/PANDRO > -`
   - `RECHERCHE SUR FONDS PROPRES > -`
5. It clicks "Enregistrer". The app saves the timesheet as a draft.
6. It returns a summary. Claude then asks you to confirm that the timesheet is correct, and asks if you want to submit it.

`fill_month` parameters:

- `mode`: `rotate` (default) gives each day fully to one task, in turn, as in the earlier months. The task totals differ by one day at most. `split` divides each day across the four tasks.
- `save`: `true` (default) saves the timesheet. `false` fills the form but does not save it (preview).

`submit_timesheet` does these steps only after you agree:

1. It makes sure that the status is "Draft" or "Rejected".
2. It opens the timesheet and clicks "Soumettre".
3. It clicks "Ok" in the "Are you sure?" dialog.
4. It waits until the status changes. If the app shows a warning (for example, too many hours), the tool returns the warning.

`submit_timesheet` parameters:

- `confirm`: must be `true`. If not, the tool does not submit.
- `dryRun`: `true` opens the timesheet and finds the "Soumettre" button, but does not click it.

Limits:

- The app lets you select only the current month and earlier months.
- The tool does not make a timesheet for a month that already has one.

## App changes

If a step fails because the WorkTimePro app changed (an element, a text or an Angular scope is missing), the error starts with `UI_CHANGED`. The error gives the step name and the URL. The server also saves a screenshot and the page HTML in `explore/out/ui-errors/`.

Other errors (for example "the timesheet does not exist") do not start with `UI_CHANGED`.

For the procedure that Claude follows after a `UI_CHANGED` error (fix, test, GitHub issue with the label `ui-change`), refer to the "UI-change rule" in [CLAUDE.md](../CLAUDE.md).

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
```

In the CLI, `fill` is a preview unless you add `--save`.

## Tests

```
npm test            # unit tests: no Chrome, less than 1 s
npm run test:live   # tests on the real app: Chrome and a sign-in, approximately 30 s
```

- `test/unit.test.mjs`: `parseMonth`, `distribute`, `classifyDays` (holidays, "BLOCAGE" locks, read-only days, `daysOff`) and the input rules of the MCP server.
- `test/live.test.mjs`: reads, previews (`save: false`) and dry runs (`dryRun: true`) only. These tests never save or submit a timesheet. The last test makes sure that the list of timesheets did not change.
- `test/fixtures.json`: the expected values for the live tests (the approved timesheet and the preview months). If the data in the app changes, update this file.

## Exploration scripts

The `explore/` folder has the scripts that were used to examine the app: `launch.mjs`, `inspect.mjs`, `goto.mjs`, `click.mjs`, `eval.mjs`. The output goes to `explore/out/`.
