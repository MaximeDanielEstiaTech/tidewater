---
name: mcp-design
description: Use when building, adding, changing or testing a tool in an MCP (Model Context Protocol) server. Drives the work test-first, covering logic, tool metadata, protocol behaviour, errors and security.
---

# Test-driven development of MCP server tools

Build every MCP tool test-first. No tool, schema field or error path gets written until a failing test asks for it.

An MCP tool has two consumers: the code that calls it and the model that reads it. The model sees only the tool's name, description, input schema, annotations and results. Treat all of those as contract and test them.

## Step 1: Discover the project before writing anything

1. Identify the language and SDK in use (TypeScript `@modelcontextprotocol/sdk`, Python `mcp`, or another), and check its installed version.
2. Find the test runner, test directory layout and naming conventions, and how existing tools are registered.
3. Check whether a server factory exists that accepts injected dependencies (e.g. `createServer(deps)`). If not, introducing one is the first refactor, done under a test.
4. Follow the existing conventions. Only apply the layout below where the project has none.

Then read the reference for the language in use:
- TypeScript: `references/typescript.md`
- Python: `references/python.md`

Verify the SDK APIs shown there against the installed version before relying on them. If they differ, follow the installed SDK.

## Structure to aim for

Keep logic out of the transport, in three layers:

- **Domain:** plain functions with typed input and output. They throw typed domain errors and receive dependencies (repositories, HTTP clients, clocks, RNG) as arguments. They contain no MCP imports.
- **Adapter:** declares the tool's name, description, schemas and annotations, calls the domain function, and maps outcomes to a `CallToolResult`.
- **Server factory:** builds the server from injected dependencies. Tests pass fakes; the entry point passes real dependencies and attaches a transport.

If a test needs the MCP SDK to check business logic, that logic belongs in the domain layer.

### Server folder (required in this repository)

Each custom MCP server must have these items, so that the "MCP tool usage" rule in `CLAUDE.md` and its hook apply to it:

- Its own folder at the root of the repository, with the name `<name>-mcp/`.
- An entry in `.mcp.json`. The path of the entry file starts with the server folder (for example `"args": ["<name>-mcp/src/server.mjs"]`).
- An empty `issue/` folder with an empty `issue/.gitkeep` file. Agents write error logs in this folder. Git keeps only `.gitkeep`.
- A section `## Usual refusals` in the README of the server. It lists each error that a tool gives on purpose (for example incorrect input, unknown ID, missing confirmation). All other errors are fatal errors.
- A test that makes sure that `issue/.gitkeep`, the section `## Usual refusals` and the `.mcp.json` entry exist.

When you add a tool that has a new refusal, add the refusal to the section `## Usual refusals` in the same change.

## Step 2: Run the TDD loop, one behaviour at a time

For each behaviour:

1. Write the smallest failing test at the lowest layer that can express it.
2. If the behaviour is visible to clients, also write or extend an integration test that goes through a real client over an in-memory transport.
3. Run the tests and confirm they fail for the expected reason. Do not implement before seeing red.
4. Write the simplest code that passes.
5. Refactor with all tests green.
6. Run the full suite before moving to the next behaviour.

Start a new tool with an integration test asserting it appears in `tools/list` with the right name and required arguments. Make it pass with a stub. Then implement behaviours in this order:

1. Happy path
2. Boundaries: empty input, zero results, maximum length, pagination limits
3. Input the schema rejects
4. Input that passes the schema but breaks domain rules (unknown ID, invalid state)
5. Downstream failures: timeout, not found, server error, permission denied
6. Large outputs: truncation or pagination
7. Cancellation and progress, if the tool is long-running
8. Security cases relevant to the tool's arguments (see `references/errors-and-security.md`)

## What each test layer covers

**Unit (domain):** every branch, preferably table-driven. Assert error types or codes, not only messages. No MCP types.

**Contract (metadata):**
- The name is stable and follows the project's convention. Renaming it is a breaking change.
- The description is non-empty and says what the tool does, when to use it, and its limits. Assert key phrases, not the full string.
- The input schema has the correct required fields, a `description` on every property, and the intended enums, bounds and defaults.
- If the tool returns `structuredContent`, real results validate against the output schema.
- Annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) are accurate.

Schema snapshots are acceptable only if diffs are reviewed as API changes.

**Integration (in-memory client ↔ server):**
- `tools/list` returns the tool with the expected schema.
- `tools/call` with valid arguments returns the expected `content` and `structuredContent`.
- Schema-invalid arguments produce an error that names the field.
- Domain and downstream errors return `isError: true` with an actionable message.
- Unexpected exceptions are caught and don't leak secrets, stack traces or internal paths.
- The server still answers `tools/list` after every error-path test.
- An unknown tool name produces a protocol error.

**E2E (real transport):** keep to a handful. The built server starts over stdio or Streamable HTTP, initializes, lists tools, answers one call and shuts down cleanly. For HTTP, unauthenticated requests are rejected.

For the error-mapping table and security cases, read `references/errors-and-security.md`.

## Test conventions

- Name tests after behaviour (`returns_error_when_note_not_found`).
- One behaviour per test, arranged as Arrange–Act–Assert.
- Each test creates and closes its own server and client pair.
- Prefer fakes over mocks. Intercept HTTP and fail on unmatched requests.
- Inject clocks and randomness. Never sleep; await events or use fake timers.
- Use a temp directory for file work. Never touch real user paths.
- Scrub secrets and personal data from any recorded fixtures.
- Configure the runner to fail on unhandled rejections.

## Breaking changes

Renaming a tool, removing or newly requiring a field, or changing the output shape is a breaking change. Update the contract test in the same change and tell the user it is breaking.

## Before reporting a tool as done

Run the full suite and check each item:

- [ ] Domain logic covered, including edge cases
- [ ] Contract tests for name, description, schemas and annotations
- [ ] Integration tests for listing, happy path, schema-invalid input, domain errors and unexpected errors
- [ ] Relevant security cases covered
- [ ] Server healthy after every error-path test
- [ ] E2E smoke test passes on the built artefact, if the project has an E2E suite
- [ ] The description tells a model when to use the tool and when not to
- [ ] The server folder has `issue/.gitkeep`, a `.mcp.json` entry and a test for them
- [ ] Each new refusal of the tool is in the section `## Usual refusals` of the README

Report which items you could not complete and why. Suggest the user check the tool manually in the MCP Inspector.
