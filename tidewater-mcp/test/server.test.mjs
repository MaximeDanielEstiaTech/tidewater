// Contract and integration tests of the MCP tools. A client and the server talk in memory.
// The tests give fake operations to the server, so they do not need Chrome or the app.
// Run: npm test
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../src/create-server.mjs";
import { TimesheetError } from "../src/tidewater.mjs";

const SHEET = { id: 1425, period: "October", year: 2026, periodStart: "2026-10-01", status: "Draft", totalHours: 161.26, tasks: [] };

// Fake operations. Each test can replace one of them. "calls" records the calls.
function fakeOps(overrides = {}) {
  const calls = [];
  const record = (name, result) => async (_page, args) => {
    calls.push({ name, args });
    return typeof result === "function" ? result(args) : result;
  };
  const ops = {
    listTimesheets: record("listTimesheets", [SHEET]),
    getTimesheet: record("getTimesheet", SHEET),
    fillMonth: record("fillMonth", (opts) => ({ saved: opts.save !== false, id: 1500, period: "Novembre 2026" })),
    submitTimesheet: record("submitTimesheet", ({ id, dryRun }) => ({ submitted: !dryRun, dryRun, timesheet: { ...SHEET, id } })),
  };
  for (const [name, fn] of Object.entries(overrides)) ops[name] = record(name, fn);
  return { ops, calls };
}

let close;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function connect(overrides) {
  const { ops, calls } = fakeOps(overrides);
  const server = createServer({ getPage: async () => ({ fake: true }), ops });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  close = async () => {
    await client.close();
    await server.close();
  };
  return { client, calls };
}

const text = (res) => res.content.map((c) => c.text).join("\n");
const throwing = (err) => () => {
  throw err;
};

// Returns the error text of a call that the server refuses. The SDK gives an isError result or a protocol error.
async function refused(client, name, args) {
  let res;
  try {
    res = await client.callTool({ name, arguments: args });
  } catch (err) {
    if (!(err instanceof McpError)) throw err;
    return err.message;
  }
  assert.equal(res.isError, true, `${name} ${JSON.stringify(args)} was not refused: ${text(res)}`);
  return text(res);
}

async function assertHealthy(client) {
  const { tools } = await client.listTools();
  assert.equal(tools.length, 4);
}

describe("contract", () => {
  test("lists_the_four_tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["fill_month", "get_timesheet", "list_timesheets", "submit_timesheet"]);
  });

  test("required_fields_are_correct", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const req = Object.fromEntries(tools.map((t) => [t.name, [...(t.inputSchema.required ?? [])].sort()]));
    assert.deepEqual(req, {
      list_timesheets: [],
      get_timesheet: ["id"],
      fill_month: ["month", "year"],
      submit_timesheet: ["confirm", "id"],
    });
  });

  test("every_property_has_a_description", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    for (const t of tools) {
      for (const [name, prop] of Object.entries(t.inputSchema.properties ?? {})) {
        assert.ok(prop.description?.length > 10, `${t.name}.${name} has no description`);
      }
    }
  });

  test("annotations_are_correct", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const a = Object.fromEntries(tools.map((t) => [t.name, t.annotations ?? {}]));
    assert.equal(a.list_timesheets.readOnlyHint, true);
    assert.equal(a.get_timesheet.readOnlyHint, true);
    assert.equal(a.fill_month.readOnlyHint, false);
    assert.equal(a.fill_month.destructiveHint, false);
    assert.equal(a.fill_month.idempotentHint, false);
    assert.equal(a.submit_timesheet.readOnlyHint, false);
    assert.equal(a.submit_timesheet.destructiveHint, true);
    assert.equal(a.submit_timesheet.idempotentHint, false);
    for (const t of tools) assert.equal(t.annotations?.openWorldHint, true, t.name);
  });

  test("descriptions_say_when_to_use_the_tool", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const d = Object.fromEntries(tools.map((t) => [t.name, t.description]));
    assert.match(d.list_timesheets, /Use it/);
    assert.match(d.get_timesheet, /list_timesheets/);
    assert.match(d.fill_month, /never submits/);
    assert.match(d.fill_month, /preview/);
    assert.match(d.submit_timesheet, /cannot undo/);
    assert.match(d.submit_timesheet, /explicitly/);
  });

  test("fill_month_bounds_and_defaults", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const p = tools.find((t) => t.name === "fill_month").inputSchema.properties;
    assert.equal(p.hoursPerDay.maximum, 7.33);
    assert.equal(p.hoursPerDay.default, 7.33);
    assert.deepEqual(p.mode.enum, ["rotate", "split"]);
    assert.equal(p.save.default, true);
  });
});

describe("happy path", () => {
  test("list_timesheets_returns_the_list", async () => {
    const { client } = await connect();
    const res = await client.callTool({ name: "list_timesheets", arguments: {} });
    assert.ok(!res.isError);
    assert.deepEqual(JSON.parse(text(res)), [SHEET]);
  });

  test("get_timesheet_returns_the_timesheet", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({ name: "get_timesheet", arguments: { id: 1425 } });
    assert.ok(!res.isError);
    assert.equal(JSON.parse(text(res)).id, 1425);
    assert.equal(calls[0].args, 1425);
  });

  test("fill_month_preview_does_not_add_next_step", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({ name: "fill_month", arguments: { month: 11, year: 2026, save: false } });
    assert.ok(!res.isError);
    assert.equal(calls[0].args.save, false);
    assert.equal(JSON.parse(text(res)).nextStep, undefined);
  });

  test("fill_month_save_tells_the_model_to_ask_the_user", async () => {
    const { client } = await connect();
    const res = await client.callTool({ name: "fill_month", arguments: { month: 11, year: 2026 } });
    assert.match(JSON.parse(text(res)).nextStep, /Ask the user/);
  });

  test("submit_timesheet_dry_run_does_not_need_confirm", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({ name: "submit_timesheet", arguments: { id: 1425, confirm: false, dryRun: true } });
    assert.ok(!res.isError);
    assert.deepEqual(calls[0].args, { id: 1425, dryRun: true });
  });
});

describe("input that the schema refuses", () => {
  for (const [name, args, field] of [
    ["fill_month", { month: 13, year: 2026, save: false }, "month"],
    ["fill_month", { month: 10, year: 2017, save: false }, "year"],
    ["fill_month", { month: 10, year: 2026, hoursPerDay: 8, save: false }, "hoursPerDay"],
    ["fill_month", { month: 10, year: 2026, hoursPerDay: 0, save: false }, "hoursPerDay"],
    ["fill_month", { month: 10, year: 2026, daysOff: [32], save: false }, "daysOff"],
    ["fill_month", { month: 10, year: 2026, mode: "random", save: false }, "mode"],
    ["fill_month", { month: 10, save: false }, "year"],
    ["get_timesheet", { id: 0 }, "id"],
    ["get_timesheet", { id: 1.5 }, "id"],
    ["submit_timesheet", { id: 1425 }, "confirm"],
  ]) {
    test(`refuses_${name}_${JSON.stringify(args)}_and_names_${field}`, async () => {
      const { client, calls } = await connect();
      const msg = await refused(client, name, args);
      assert.match(msg, new RegExp(field));
      assert.equal(calls.length, 0, "the operation must not run");
      await assertHealthy(client);
    });
  }
});

describe("errors", () => {
  test("submit_without_confirm_is_refused_and_does_not_run", async () => {
    const { client, calls } = await connect();
    const msg = await refused(client, "submit_timesheet", { id: 1425, confirm: false });
    assert.match(msg, /did not submit/);
    assert.equal(calls.length, 0);
    await assertHealthy(client);
  });

  test("domain_error_gives_its_message", async () => {
    const err = new TimesheetError("NOT_FOUND", "Timesheet 9 does not exist. Use list_timesheets to find your timesheet IDs.");
    const { client } = await connect({ getTimesheet: throwing(err) });
    const msg = await refused(client, "get_timesheet", { id: 9 });
    assert.match(msg, /does not exist\. Use list_timesheets/);
    await assertHealthy(client);
  });

  test("unexpected_exception_does_not_leak_the_stack", async () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'x')");
    const { client } = await connect({ listTimesheets: throwing(err) });
    const msg = await refused(client, "list_timesheets", {});
    assert.doesNotMatch(msg, /\n\s+at /);
    assert.doesNotMatch(msg, /node_modules|\.mjs:\d+/);
    await assertHealthy(client);
  });

  test("browser_failure_is_reported_and_server_stays_healthy", async () => {
    const { ops } = fakeOps();
    const server = createServer({ getPage: throwing(new Error("The timesheet app did not open. Sign in to Microsoft in the Chrome window, then try again.")), ops });
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
    close = async () => {
      await client.close();
      await server.close();
    };
    const msg = await refused(client, "list_timesheets", {});
    assert.match(msg, /Sign in/);
    await assertHealthy(client);
  });

  test("unknown_tool_gives_an_error", async () => {
    const { client } = await connect();
    await refused(client, "delete_everything", {});
    await assertHealthy(client);
  });
});
