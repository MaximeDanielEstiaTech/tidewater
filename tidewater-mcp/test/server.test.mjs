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

const SUMMARY = { id: 1425, period: "October", year: 2026, periodStart: "2026-10-01", totalHours: 161.26, status: "Draft" };
const SHEET = { ...SUMMARY, tasks: [{ task: "PANDRONE - ETECH/PANDRO > -", hours: 7.33, days: [5] }] };
const FILL = {
  period: "Novembre 2026",
  mode: "rotate",
  hoursPerDay: 7.33,
  workDays: 1,
  holidaysSkipped: [11],
  lockedDays: [],
  daysOffSkipped: [],
  timeOffInApp: [],
  expectedTotal: 7.33,
  formTotal: 7.33,
  perTask: [{ task: "PANDRONE - ETECH/PANDRO > -", hours: 7.33, days: 1 }],
};

// Fake operations. Each test can replace one of them. "calls" records the calls.
function fakeOps(overrides = {}) {
  const calls = [];
  const record = (name, result) => async (_page, args) => {
    calls.push({ name, args });
    return typeof result === "function" ? result(args) : result;
  };
  const ops = {
    listTimesheets: record("listTimesheets", [SUMMARY]),
    getTimesheet: record("getTimesheet", SHEET),
    fillMonth: record("fillMonth", (opts) =>
      opts.save ? { saved: true, id: 1500, status: "Draft", storedTotal: 7.33, ...FILL } : { saved: false, ...FILL },
    ),
    submitTimesheet: record("submitTimesheet", ({ id, dryRun }) =>
      dryRun ? { submitted: false, dryRun: true, buttonFound: "Soumettre", timesheet: { ...SHEET, id } } : { submitted: true, timesheet: { ...SHEET, id } },
    ),
    deleteTimesheet: record("deleteTimesheet", ({ id, dryRun }) =>
      dryRun ? { deleted: false, dryRun: true, buttonFound: "Supprimer", timesheet: { ...SHEET, id } } : { deleted: true, timesheet: { ...SHEET, id } },
    ),
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
  assert.equal(tools.length, 5);
}

describe("contract", () => {
  test("lists_the_five_tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["delete_timesheet", "fill_month", "get_timesheet", "list_timesheets", "submit_timesheet"]);
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
      delete_timesheet: ["confirm", "id"],
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
    assert.equal(a.delete_timesheet.readOnlyHint, false);
    assert.equal(a.delete_timesheet.destructiveHint, true);
    assert.equal(a.delete_timesheet.idempotentHint, false);
    for (const t of tools) assert.equal(t.annotations?.openWorldHint, true, t.name);
  });

  test("descriptions_say_when_to_use_the_tool", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const d = Object.fromEntries(tools.map((t) => [t.name, t.description]));
    assert.match(d.list_timesheets, /Use it/);
    assert.match(d.get_timesheet, /list_timesheets/);
    assert.match(d.fill_month, /never submits/);
    assert.match(d.fill_month, /save=false \(default\)/);
    assert.match(d.submit_timesheet, /cannot undo/);
    assert.match(d.submit_timesheet, /explicitly/);
    assert.match(d.delete_timesheet, /cannot undo/);
    assert.match(d.delete_timesheet, /explicitly/);
    assert.match(d.delete_timesheet, /Draft or Rejected/);
  });

  test("every_tool_has_an_output_schema", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const props = Object.fromEntries(tools.map((t) => [t.name, Object.keys(t.outputSchema?.properties ?? {})]));
    assert.ok(props.list_timesheets.includes("timesheets"));
    assert.ok(props.get_timesheet.includes("tasks"));
    assert.ok(props.fill_month.includes("saved") && props.fill_month.includes("lockedDays"));
    assert.ok(props.submit_timesheet.includes("submitted"));
    assert.ok(props.delete_timesheet.includes("deleted"));
  });

  test("delete_timesheet_dry_run_default_is_false", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    assert.equal(tools.find((t) => t.name === "delete_timesheet").inputSchema.properties.dryRun.default, false);
  });

  test("fill_month_bounds_and_defaults", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const p = tools.find((t) => t.name === "fill_month").inputSchema.properties;
    assert.equal(p.hoursPerDay.maximum, 7.33);
    assert.equal(p.hoursPerDay.default, 7.33);
    assert.deepEqual(p.mode.enum, ["rotate", "split"]);
    assert.equal(p.save.default, false);
  });
});

describe("happy path", () => {
  test("list_timesheets_returns_the_list", async () => {
    const { client } = await connect();
    const res = await client.callTool({ name: "list_timesheets", arguments: {} });
    assert.ok(!res.isError);
    assert.deepEqual(res.structuredContent, { timesheets: [SUMMARY] });
  });

  test("the_text_is_the_structured_content_as_json", async () => {
    const { client } = await connect();
    for (const [name, args] of [
      ["list_timesheets", {}],
      ["get_timesheet", { id: 1425 }],
      ["fill_month", { month: 11, year: 2026 }],
      ["fill_month", { month: 11, year: 2026, save: true }],
      ["submit_timesheet", { id: 1425, confirm: false, dryRun: true }],
      ["submit_timesheet", { id: 1425, confirm: true }],
      ["delete_timesheet", { id: 1425, confirm: false, dryRun: true }],
      ["delete_timesheet", { id: 1425, confirm: true }],
    ]) {
      const res = await client.callTool({ name, arguments: args });
      assert.ok(!res.isError, `${name}: ${text(res)}`);
      assert.ok(res.structuredContent, `${name} has no structuredContent`);
      assert.deepEqual(JSON.parse(text(res)), res.structuredContent, name);
    }
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

  test("fill_month_without_save_is_a_preview", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({ name: "fill_month", arguments: { month: 11, year: 2026 } });
    assert.ok(!res.isError);
    assert.equal(calls[0].args.save, false);
    assert.equal(JSON.parse(text(res)).saved, false);
  });

  test("fill_month_save_tells_the_model_to_ask_the_user", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({ name: "fill_month", arguments: { month: 11, year: 2026, save: true } });
    assert.equal(calls[0].args.save, true);
    assert.match(JSON.parse(text(res)).nextStep, /Ask the user/);
  });

  test("submit_timesheet_dry_run_does_not_need_confirm", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({ name: "submit_timesheet", arguments: { id: 1425, confirm: false, dryRun: true } });
    assert.ok(!res.isError);
    assert.equal(calls[0].args.id, 1425);
    assert.equal(calls[0].args.dryRun, true);
  });

  test("delete_timesheet_with_confirm_deletes", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({ name: "delete_timesheet", arguments: { id: 1425, confirm: true } });
    assert.ok(!res.isError, text(res));
    assert.equal(res.structuredContent.deleted, true);
    assert.equal(calls[0].name, "deleteTimesheet");
    assert.equal(calls[0].args.id, 1425);
    assert.equal(calls[0].args.dryRun, false);
  });

  test("delete_timesheet_dry_run_does_not_need_confirm", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({ name: "delete_timesheet", arguments: { id: 1425, confirm: false, dryRun: true } });
    assert.ok(!res.isError);
    assert.equal(res.structuredContent.deleted, false);
    assert.equal(calls[0].args.dryRun, true);
  });
});

// A gate: an operation waits on gate.wait until the test calls gate.open().
function gate() {
  let open;
  const wait = new Promise((r) => (open = r));
  return { wait, open };
}
// Lets the in-memory messages arrive. It does not wait for a fixed time.
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

describe("one call at a time on the page", () => {
  test("calls_do_not_overlap", async () => {
    const events = [];
    const g = gate();
    const { client } = await connect({
      fillMonth: async () => {
        events.push("fill start");
        await g.wait;
        events.push("fill end");
        return { saved: false, ...FILL };
      },
      listTimesheets: () => {
        events.push("list");
        return [SUMMARY];
      },
    });
    const fill = client.callTool({ name: "fill_month", arguments: { month: 11, year: 2026 } });
    await settle();
    const list = client.callTool({ name: "list_timesheets", arguments: {} });
    await settle();
    assert.deepEqual(events, ["fill start"], "list_timesheets must wait for fill_month");
    g.open();
    await Promise.all([fill, list]);
    assert.deepEqual(events, ["fill start", "fill end", "list"]);
  });

  test("a_failed_call_does_not_block_the_next_call", async () => {
    const { client } = await connect({ getTimesheet: throwing(new Error("boom")) });
    const [a, b] = await Promise.all([
      client.callTool({ name: "get_timesheet", arguments: { id: 1 } }),
      client.callTool({ name: "list_timesheets", arguments: {} }),
    ]);
    assert.equal(a.isError, true);
    assert.ok(!b.isError);
  });
});

describe("cancellation", () => {
  test("a_call_cancelled_while_it_waits_does_not_run", async () => {
    const g = gate();
    const { client, calls } = await connect({
      fillMonth: async () => {
        await g.wait;
        return { saved: false, ...FILL };
      },
    });
    const first = client.callTool({ name: "fill_month", arguments: { month: 11, year: 2026 } });
    await settle();
    const ac = new AbortController();
    const second = client.callTool({ name: "submit_timesheet", arguments: { id: 1425, confirm: true } }, undefined, { signal: ac.signal });
    await settle();
    ac.abort();
    await assert.rejects(second);
    await settle();
    g.open();
    await first;
    await settle();
    assert.deepEqual(calls.map((c) => c.name), ["fillMonth"], "submitTimesheet must not run");
    await assertHealthy(client);
  });

  test("fill_month_and_submit_get_the_abort_signal", async () => {
    const { client, calls } = await connect();
    await client.callTool({ name: "fill_month", arguments: { month: 11, year: 2026 } });
    await client.callTool({ name: "submit_timesheet", arguments: { id: 1425, confirm: false, dryRun: true } });
    await client.callTool({ name: "delete_timesheet", arguments: { id: 1425, confirm: false, dryRun: true } });
    assert.equal(calls.length, 3);
    for (const c of calls) assert.ok(c.args.signal instanceof AbortSignal, c.name);
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
    ["delete_timesheet", { id: 1425 }, "confirm"],
    ["delete_timesheet", { id: -1, confirm: true }, "id"],
    ["delete_timesheet", { id: "1425", confirm: true }, "id"],
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

  test("delete_without_confirm_is_refused_and_does_not_run", async () => {
    const { client, calls } = await connect();
    const msg = await refused(client, "delete_timesheet", { id: 1425, confirm: false });
    assert.match(msg, /did not delete/);
    assert.equal(calls.length, 0);
    await assertHealthy(client);
  });

  test("delete_of_a_submitted_timesheet_gives_the_status_error", async () => {
    const err = new Error('Timesheet 1346 has status "Approved". You can delete only a timesheet with status Draft or Rejected.');
    const { client } = await connect({ deleteTimesheet: throwing(err) });
    const msg = await refused(client, "delete_timesheet", { id: 1346, confirm: true });
    assert.match(msg, /You can delete only/);
    await assertHealthy(client);
  });

  test("delete_of_another_users_timesheet_is_refused", async () => {
    const err = new TimesheetError("NOT_OWNER", "Timesheet 7 is not one of your timesheets. Use list_timesheets to find your timesheet IDs.");
    const { client } = await connect({ deleteTimesheet: throwing(err) });
    const msg = await refused(client, "delete_timesheet", { id: 7, confirm: true });
    assert.match(msg, /not one of your timesheets/);
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
