// Claude Code hook (PostToolUse and PostToolUseFailure on mcp__tidewater__*).
// If the tool result has "UI_CHANGED", it adds a reminder of the UI-change rule in CLAUDE.md.
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  if (!raw.includes("UI_CHANGED")) process.exit(0);
  let input = {};
  try {
    input = JSON.parse(raw.replace(/^﻿/, ""));
  } catch {
    // Use the default names below.
  }

  process.stdout.write(
    JSON.stringify({
      systemMessage: "tidewater: the WorkTimePro app possibly changed (UI_CHANGED).",
      hookSpecificOutput: {
        hookEventName: input.hook_event_name ?? "PostToolUse",
        additionalContext:
          `The tool ${input.tool_name} failed with UI_CHANGED. Follow the "UI-change rule" in CLAUDE.md: ` +
          "examine the evidence, fix the code in tidewater-mcp/src/, test with a preview or dry run only, " +
          "commit, then create a GitHub issue with `gh issue create --label ui-change` and give its URL to the user.",
      },
    }),
  );
});
