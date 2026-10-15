# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Writing rule

Write all text in ASD-STE100 (Simplified Technical English). This rule applies to replies, documents, code comments and commit messages. Do not change code identifiers or quoted text.

## UI-change rule

The WorkTimePro app can change. Then a `tidewater` tool can fail. An error that starts with `UI_CHANGED` shows this type of failure. A hook in `.claude/settings.json` also reminds you of this rule.

When a `tidewater` tool fails because the app changed, do these steps:

1. Tell the user that the app possibly changed. Do not try the same action again and again.
2. Examine the evidence. The error gives the URL, a screenshot and the page HTML (in `tidewater-mcp/explore/out/ui-errors/`). If necessary, use the scripts in `tidewater-mcp/explore/`.
3. Find the cause: compare the old selector, text or Angular scope with the new one.
4. Fix the code in `tidewater-mcp/src/`. Keep the fix small.
5. Test the fix with the CLI. Use only a preview (`fill` without `--save`) or a dry run (`submit` without `--confirm`). Do not save or submit a real timesheet for a test.
6. Make a commit with the fix. Push the commit if the user agrees.
7. Create a GitHub issue. The user gives permission to create this issue without a question first:

   ```
   gh issue create --label ui-change --title "UI change: <step> - <short description>" --body-file <file>
   ```

   Write the body file in the scratchpad directory. The body has these sections:
   - **Symptom**: the tool, its parameters and the full `UI_CHANGED` error message.
   - **Cause**: what changed in the app (old and new selector, text or structure).
   - **Fix**: the changed files and functions, and the commit SHA (if pushed).
   - **Test**: the CLI command and its result.
   - **Evidence**: the names of the screenshot and HTML files. Do not attach them: they can contain personal data.

8. Give the issue URL to the user. Then do the action that the user asked for at the start, if it is still necessary.

If you cannot fix the problem, create the issue anyway. Write "Fix: not found" and add what you examined.
