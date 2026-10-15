# Request template: new MCP tool

Use this template when you ask Claude for a new tool in `tidewater-mcp`.
Copy the block below into the prompt. Replace each `<...>` field. Delete the lines that do not apply.

```markdown
Add a new tool to the tidewater MCP server (`tidewater-mcp/`).

## 1. Name and purpose
- Tool name: `<verb_noun>`  (example: `delete_timesheet`)
- Purpose: <one sentence: what the tool does for me>
- When I use it: <example request, for example "Delete the draft for November 2026">

## 2. Type of action
- [ ] Read-only. The tool reads data and does not change the app.
- [ ] Write. The tool changes data (save, submit, delete).
      If you select "Write":
      - Add a `confirm` parameter. The tool must stop if `confirm` is not `true`.
      - Add a `dryRun` parameter. With `dryRun`, the tool finds the button but does not click it.
      - Do not run the real action during tests. Ask me first.

## 3. Start point in the app
- Page or URL: <for example "My timesheets" list, or a timesheet page>
- Status that the tool accepts: <for example "Draft" or "Rejected" only>

## 4. Steps in the app
1. <Open ...>
2. <Select the tab "...">
3. <Click "..." (write the button text as the app shows it)>
4. <Click "Ok" in the dialog "...">
5. <Wait until ...>

## 5. Parameters
| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `<name>` | <string/number/boolean/array> | <yes/no> | <value> | <description> |

## 6. Result
- On success, the tool returns: <for example ID, month, new status, totals>
- On failure, the tool returns: <for example the warning text that the app shows>

## 7. Rules and limits
- <for example: do not change a timesheet with the status "Approved">
- <for example: 7.33 hours per day max>

## 8. Known data
- Selectors, texts or screenshots that I know: <paste here, or write "unknown: use the explore scripts">
- Example IDs to test with: <for example 1425>

## 9. Deliverables
- Use the `mcp-design` skill: write the tests first.
- Add the tool in `src/create-server.mjs` and the logic in `src/tidewater.mjs`.
- Add a CLI command in `src/cli.mjs`: `node src/cli.mjs <command> <args>`.
- Update the "Tools" table and the parameter list in `tidewater-mcp/README.md`.
- Add each error that the tool gives on purpose to the section "Usual refusals" in `tidewater-mcp/README.md`.
- Keep the empty `tidewater-mcp/issue/` folder (with `issue/.gitkeep`).
- Test the tool with a preview or a dry run. Show me the result before you do a real write.
```

## Instructions

- Write the button and tab texts exactly as the app shows them (for example "Soumettre", "Enregistrer").
- If you do not know the selectors, write "unknown". Claude then uses the scripts in `tidewater-mcp/explore/` to find them.
- Give one tool for each request. For more tools, send more requests.
