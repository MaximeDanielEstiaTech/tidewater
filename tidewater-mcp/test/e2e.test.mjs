// E2E smoke test: starts the real server over stdio, lists the tools and stops it.
// It does not call a tool, so it does not need Chrome.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("server_starts_over_stdio_lists_tools_and_stops", async () => {
  const serverPath = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
  const client = new Client({ name: "e2e-test", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: "node", args: [serverPath] }));
  // Close in all cases. An open server process keeps the test run alive.
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 5);
  } finally {
    await client.close();
  }
});

// The "MCP tool usage" rule in CLAUDE.md needs these files in each custom MCP server.
test("server_folder_has_issue_folder_and_usual_refusals", () => {
  const folder = new URL("../", import.meta.url);
  assert.ok(fs.existsSync(new URL("issue/.gitkeep", folder)), "issue/.gitkeep is missing");
  const readme = fs.readFileSync(new URL("README.md", folder), "utf8");
  assert.match(readme, /^## Usual refusals$/m);
});

test("server_is_in_mcp_json_with_its_folder", () => {
  const config = JSON.parse(fs.readFileSync(new URL("../../.mcp.json", import.meta.url), "utf8"));
  assert.ok(config.mcpServers.tidewater.args.some((a) => a.startsWith("tidewater-mcp/")));
});
