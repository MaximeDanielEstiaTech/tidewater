# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Writing rule

Write all text in ASD-STE100 (Simplified Technical English). This rule applies to replies, documents, code comments and commit messages. Do not change code identifiers or quoted text.

## MCP tool usage

This rule applies to you and to all subagents.

### Custom MCP servers

A custom MCP server is a server in `.mcp.json` whose code is in this repository. Its tools have the prefix `mcp__<server name>__`. Its **server folder** is the first folder in the path of its entry file in `.mcp.json`. Example: `"args": ["tidewater-mcp/src/server.mjs"]` gives the server folder `tidewater-mcp/`.

### When to write a log file

When a tool of a custom MCP server gives a fatal error or an unexpected output, write a log file in `<server folder>/issue/`. Do this before you try a different action.

- **Usual refusal** (not fatal): an error that the tool gives on purpose and that tells you to change the input or to ask the user. Examples: input that the schema refuses, an unknown ID, a missing confirmation. The section "Usual refusals" in the README of the server folder gives the full list for that server.
- **Fatal error**: all other errors. Examples: the tool fails, the server does not answer, an error that the README does not list, a `UI_CHANGED` error.
- **Unexpected output**: the tool gives no error, but the result does not agree with the request or with the data. Examples: an incorrect total, a missing field, an action that the tool reports as done but that did not occur.

### Log file

Name the file `YYYY-MM-DD-HHMMSS-<tool>-<short-description>.md`. Use these sections:

- **Time**: date and time.
- **Agent**: main agent or subagent (with its task).
- **Request**: what the user asked for.
- **Tool call**: the tool name and all parameters.
- **Result**: the full error message or the output.
- **Expected**: what you expected, and why.
- **Next action**: what you did after the error (for example a fix, a GitHub issue, or a question to the user).

Then tell the user the path of the log file. After a tool error of a custom MCP server, a hook (`.claude/hooks/mcp-error-reminder.mjs`) reminds you of this rule and makes sure that the `issue/` folder exists. The hook cannot find an unexpected output: you must find it yourself. The log files are not in git, because they can contain personal data.

### New custom MCP server

When you make a new custom MCP server, use the `mcp-design` skill and do these steps. Then this rule and the hook apply to the server with no change to this file:

1. Put the server in its own folder at the root of the repository, with the name `<name>-mcp/`.
2. Add the server to `.mcp.json`. The path of the entry file must start with the server folder.
3. Add an empty `issue/` folder with an empty `issue/.gitkeep` file. Git does not keep empty folders.
4. Add a section "Usual refusals" to the README of the server.
5. Add a test that makes sure that `issue/.gitkeep`, the section "Usual refusals" and the `.mcp.json` entry exist.

When you add a tool to a custom MCP server, add each error that the tool gives on purpose to the section "Usual refusals".