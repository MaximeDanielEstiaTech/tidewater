# tidewater

- `tidewater-mcp/`: the MCP server that fills the timesheets. Refer to [tidewater-mcp/README.md](tidewater-mcp/README.md).

# Setup

Do these steps one time on each computer. At the start of each session, the hook `.claude/hooks/check-setup.mjs` finds the steps that are not done and tells Claude.

## Requirements

| Requirement | Necessary for | Check |
|---|---|---|
| Windows | the MCP server (it finds Chrome in the Windows folders) and the monthly script | — |
| Node.js 20 or later | the MCP server and all hooks | `node --version` |
| Git for Windows (Git Bash) | Claude Code on Windows and the monthly script | `git --version` |
| Claude Code (`claude` in the `PATH`) | all | `claude --version` |
| Google Chrome | the MCP server | — |
| An Estia account with access to WorkTimePro | the MCP server | — |
| Python 3 with `langfuse>=4.0,<5` | only Langfuse tracing | `python -c "import langfuse"` |

## Steps

1. Clone the repository and install the MCP server:
   ```
   cd tidewater-mcp
   npm install
   ```
2. Copy `.claude/settings.local.example.json` to `.claude/settings.local.json`. Git ignores this file.
3. Start Claude Code in the repository root and accept the `tidewater` server.
4. Run `/worktimepro` or call `list_timesheets`. Sign in to Microsoft in the Chrome window. The Chrome profile is in `%LOCALAPPDATA%\tidewater-mcp\chrome-profile`, so you sign in one time only.
5. Optional: Langfuse tracing (refer to "Langfuse tracing").
6. Optional: the monthly script (refer to "Monthly script").

If Chrome is not in a standard folder, set `CHROME_PATH` to the path of `chrome.exe`.

## Langfuse tracing

1. Install the package: `pip install "langfuse>=4.0,<5"`.
2. In `.claude/settings.local.json`, set `TRACE_TO_LANGFUSE` to `"true"` and add the keys of your Langfuse project (Settings > API Keys).
3. Start a new Claude Code session.

The hook `.claude/hooks/langfuse-hook.mjs` finds Python (`python3`, `python` or `py -3`). If it uses an incorrect Python, set `LANGFUSE_PYTHON` to the path of `python.exe`.

To stop tracing with no restart, make the file `.claude/langfuse-state/off`. Remove it to start again:

```
New-Item .claude/langfuse-state/off      # off
Remove-Item .claude/langfuse-state/off   # on
```

## Monthly script

`.claude/scripts/worktimepro-monthly.ps1` opens Claude Code with `/worktimepro` on the last working day of the month. To start it at each logon, run this command one time in PowerShell, in the repository root:

```
$script = (Resolve-Path .claude/scripts/worktimepro-monthly.ps1).Path
Register-ScheduledTask -TaskName "tidewater worktimepro" -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) -Action (New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"")
```

To test it: `.claude/scripts/worktimepro-monthly.ps1 -DryRun`.

# The work loop

- **Agent (Perceive / Sense):** The system takes in a goal, current environment state, and rules, gathering structured or unstructured data to understand the problem.
- **Plan:** The model evaluates multiple paths, analyzes risks, and breaks a complex objective down into a structured sequence or roadmap of steps.
- **Act:** The agent executes the plan dynamically using external software, databases, or APIs (such as calling a tool or writing code).
- **Verify (Observe / Reflect):** The system checks the output of its action against success criteria, looking for errors, gaps, or unexpected results.
- **Adapt (Replan):** If verification fails or reveals a gap, the agent adjusts its parameters, tries a different tool, or triggers adaptive replanning until the goal is met.
- **Deliver:** The agent finalizes the validated output and terminates the loop once it satisfies quality and completeness thresholds


# Plugins

claude plugin marketplace add langfuse/Claude-Observability-Plugin
claude plugin install langfuse-observability@langfuse-observability
