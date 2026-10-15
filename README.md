# tidewater

- `tidewater-mcp/`: the MCP server that fills the timesheets. Refer to [tidewater-mcp/README.md](tidewater-mcp/README.md).

# Install plugins

claude plugin marketplace add langfuse/Claude-Observability-Plugin
claude plugin install langfuse-observability@langfuse-observability

**Agent (Perceive / Sense):** The system takes in a goal, current environment state, and rules, gathering structured or unstructured data to understand the problem.
**Plan:** The model evaluates multiple paths, analyzes risks, and breaks a complex objective down into a structured sequence or roadmap of steps.
**Act:** The agent executes the plan dynamically using external software, databases, or APIs (such as calling a tool or writing code).
**Verify (Observe / Reflect):** The system checks the output of its action against success criteria, looking for errors, gaps, or unexpected results.
**Adapt (Replan):** If verification fails or reveals a gap, the agent adjusts its parameters, tries a different tool, or triggers adaptive replanning until the goal is met.
**Deliver:** The agent finalizes the validated output and terminates the loop once it satisfies quality and completeness thresholds
