// E2E smoke test: starts the real server over stdio, lists the tools and stops it.
// It does not call a tool, so it does not need Chrome.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("server_starts_over_stdio_lists_tools_and_stops", async () => {
  const serverPath = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
  const client = new Client({ name: "e2e-test", version: "0.0.0" });
  await client.connect(new StdioClientTransport({ command: "node", args: [serverPath] }));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 4);
  await client.close();
});
