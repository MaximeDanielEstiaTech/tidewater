#!/usr/bin/env node
// MCP server for the timesheet app. It controls a visible Chrome with puppeteer.
// The tools are in create-server.mjs. This file only attaches the stdio transport.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./create-server.mjs";

await createServer().connect(new StdioServerTransport());
