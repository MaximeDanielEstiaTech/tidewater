// Claude Code hook (Stop). Starts langfuse_hook.py with a Python that has the langfuse package.
// Python has different command names on different computers (python3, python, py -3), so this launcher finds one.
// When TRACE_TO_LANGFUSE is not "true", it stops at once: then Python is not necessary.
// LANGFUSE_PYTHON (a path to python.exe) overrides the search.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.TRACE_TO_LANGFUSE !== "true") process.exit(0);

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "langfuse_hook.py");
const candidates = [
  ...(process.env.LANGFUSE_PYTHON ? [[process.env.LANGFUSE_PYTHON]] : []),
  ["python3"],
  ["python"],
  ["py", "-3"],
];
// Finds the package with no import, so the check is fast.
const probe = "import importlib.util, sys; sys.exit(importlib.util.find_spec('langfuse') is None)";

const python = candidates.find(([cmd, ...args]) => {
  const r = spawnSync(cmd, [...args, "-c", probe], { stdio: "ignore", timeout: 5000, windowsHide: true });
  return r.status === 0;
});

if (!python) {
  console.error(
    "Langfuse tracing: TRACE_TO_LANGFUSE is true, but no Python with the langfuse package was found " +
      "(tried python3, python, py -3). Run: pip install \"langfuse>=4.0,<5\", or set LANGFUSE_PYTHON.",
  );
  process.exit(1);
}

const [cmd, ...args] = python;
const r = spawnSync(cmd, [...args, script], { input: fs.readFileSync(0), stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
process.exit(r.status ?? 0);
