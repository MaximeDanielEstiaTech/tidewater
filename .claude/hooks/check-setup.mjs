// Claude Code hook (SessionStart). Finds the setup steps that are not done on this computer
// and tells the agent (refer to "Setup" in README.md). When all steps are done, it shows nothing.
import fs from "node:fs";
import path from "node:path";
import { findChrome } from "../../tidewater-mcp/src/config.mjs";

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const missing = [];

if (!fs.existsSync(path.join(root, "tidewater-mcp", "node_modules"))) {
  missing.push("The tidewater MCP server cannot start: run `npm install` in `tidewater-mcp/`, then restart Claude Code.");
}
if (!findChrome()) {
  missing.push("Chrome was not found: install Google Chrome, or set CHROME_PATH to chrome.exe.");
}
if (!fs.existsSync(path.join(root, ".claude", "settings.local.json"))) {
  missing.push(
    "`.claude/settings.local.json` does not exist: copy `.claude/settings.local.example.json` to it, " +
      "then add the Langfuse keys (only for tracing).",
  );
}

if (missing.length) {
  console.log(
    "Setup of this repository is not complete on this computer (refer to \"Setup\" in README.md). " +
      "Tell the user:\n- " + missing.join("\n- "),
  );
}
