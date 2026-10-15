// Claude Code hook (PostToolUse and PostToolUseFailure on mcp__*).
// After a tool error of a custom MCP server (a server in .mcp.json with its code in this repository),
// it makes sure that <server folder>/issue/ exists and reminds the agent of the "MCP tool usage" rule in CLAUDE.md.
// For other MCP servers, it does nothing.
import fs from "node:fs";
import path from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// Gives the server folder of a custom MCP server, or null.
// The server folder is the first folder in the path of the entry file in .mcp.json.
function serverFolder(serverName) {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8"));
  } catch {
    return null;
  }
  const entry = config.mcpServers?.[serverName];
  for (const arg of entry?.args ?? []) {
    const parts = String(arg).split(/[\\/]/);
    if (parts.length < 2 || path.isAbsolute(arg)) continue;
    if (fs.existsSync(path.join(root, arg)) && fs.statSync(path.join(root, parts[0])).isDirectory()) return parts[0];
  }
  return null;
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input = {};
  try {
    input = JSON.parse(raw.replace(/^﻿/, ""));
  } catch {
    process.exit(0);
  }
  const event = input.hook_event_name ?? "PostToolUse";
  const failed = event === "PostToolUseFailure" || /"isError"\s*:\s*true/.test(JSON.stringify(input.tool_response ?? ""));
  if (!failed) process.exit(0);

  const match = /^mcp__(.+?)__(.+)$/.exec(input.tool_name ?? "");
  const folder = match && serverFolder(match[1]);
  if (!folder) process.exit(0);

  const issueDir = path.join(root, folder, "issue");
  fs.mkdirSync(issueDir, { recursive: true });

  const tool = input.tool_name;
  process.stdout.write(
    JSON.stringify({
      systemMessage: `${match[1]}: ${match[2]} gave an error.`,
      hookSpecificOutput: {
        hookEventName: event,
        additionalContext:
          `The tool ${tool} gave an error. Follow the "MCP tool usage" rule in CLAUDE.md: if the error is not a usual refusal ` +
          `(see "Usual refusals" in ${folder}/README.md), write a log file in ${folder}/issue/ before you try a different action, ` +
          "and tell the user its path.",
      },
    }),
  );
});
