// Command line access to the same functions as the MCP server. Use it for tests.
// Usage:
//   node src/cli.mjs list
//   node src/cli.mjs get <id>
//   node src/cli.mjs fill <month> <year> [--save] [--split] [--allow-duplicate] [--days-off=3,4] [--hours=7.33]
//   node src/cli.mjs submit <id> [--confirm]
//   node src/cli.mjs delete <id> [--confirm]
// "fill" without --save is a preview. "submit" and "delete" without --confirm are dry runs: they find the button but do not click it.
import { getAppPage } from "./browser.mjs";
import { listTimesheets, getTimesheet, fillMonth, submitTimesheet, deleteTimesheet } from "./tidewater.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const args = rest.filter((a) => !a.startsWith("--"));

const page = await getAppPage();
let out;
if (cmd === "list") {
  out = await listTimesheets(page);
} else if (cmd === "get") {
  out = await getTimesheet(page, Number(args[0]));
} else if (cmd === "fill") {
  out = await fillMonth(page, {
    month: args[0],
    year: args[1],
    save: "save" in flags,
    mode: "split" in flags ? "split" : "rotate",
    allowDuplicate: "allow-duplicate" in flags,
    daysOff: flags["days-off"] ? flags["days-off"].split(",") : [],
    hoursPerDay: flags.hours ? Number(flags.hours) : undefined,
  });
} else if (cmd === "submit") {
  out = await submitTimesheet(page, { id: Number(args[0]), dryRun: !("confirm" in flags) });
} else if (cmd === "delete") {
  out = await deleteTimesheet(page, { id: Number(args[0]), dryRun: !("confirm" in flags) });
} else {
  console.error("Usage: node src/cli.mjs list | get <id> | fill <month> <year> [--save] ... | submit <id> [--confirm] | delete <id> [--confirm]");
  process.exit(1);
}
console.log(JSON.stringify(out, null, 2));
await page.browser().disconnect();
