// Starts the MCP server over stdio, lists its tools and calls the read-only tools.
// It also checks that submit_timesheet refuses to run without confirm=true. It does not submit anything.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const serverPath = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(new StdioClientTransport({ command: "node", args: [serverPath] }));
const { tools } = await client.listTools();
console.log("Tools:", tools.map((t) => t.name).join(", "));

const show = (name, res) => console.log(`${name}: ${res.isError ? "ERROR" : "OK"} ${res.content[0].text.slice(0, 300)}`);
const list = await client.callTool({ name: "list_timesheets", arguments: {} });
show("list_timesheets", list);
const id = JSON.parse(list.content[0].text)[0].id;
show("get_timesheet", await client.callTool({ name: "get_timesheet", arguments: { id } }));
show("submit_timesheet confirm=false", await client.callTool({ name: "submit_timesheet", arguments: { id, confirm: false } }));
await client.close();
