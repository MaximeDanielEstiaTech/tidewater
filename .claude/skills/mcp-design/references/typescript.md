# TypeScript reference (official SDK, Vitest)

Check these imports and method names against the installed `@modelcontextprotocol/sdk` version. Adapt them if the API differs. Use the project's test runner if it isn't Vitest.

## Contents
- Domain unit test
- In-memory connection helper
- Integration tests
- Adapter

## Domain unit test

```ts
// tests/unit/searchNotes.test.ts
import { describe, it, expect } from "vitest";
import { searchNotes } from "../../src/domain/searchNotes";

const repo = {
  all: async () => [
    { id: "1", title: "TDD basics", body: "red green refactor" },
    { id: "2", title: "Groceries", body: "milk" },
  ],
};

describe("searchNotes", () => {
  it("matches title or body case-insensitively", async () => {
    const result = await searchNotes({ query: "REFACTOR", limit: 10 }, { repo });
    expect(result.map(n => n.id)).toEqual(["1"]);
  });

  it("respects the limit", async () => {
    const result = await searchNotes({ query: "", limit: 1 }, { repo });
    expect(result).toHaveLength(1);
  });
});
```

## In-memory connection helper

```ts
// tests/helpers/connect.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, type Deps } from "../../src/server";

export async function connect(deps: Deps) {
  const server = createServer(deps);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    close: async () => { await client.close(); await server.close(); },
  };
}
```

## Integration tests

```ts
// tests/integration/searchNotes.tool.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { connect } from "../helpers/connect";
import { fakeRepo } from "../fixtures/repo";

let close: (() => Promise<void>) | undefined;
afterEach(async () => { await close?.(); close = undefined; });

describe("search_notes tool", () => {
  it("is listed with a required 'query' argument and read-only hint", async () => {
    const c = await connect({ repo: fakeRepo() }); close = c.close;
    const { tools } = await c.client.listTools();
    const tool = tools.find(t => t.name === "search_notes");
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.required).toContain("query");
    expect(tool!.annotations?.readOnlyHint).toBe(true);
  });

  it("returns matching notes", async () => {
    const c = await connect({ repo: fakeRepo() }); close = c.close;
    const res = await c.client.callTool({
      name: "search_notes",
      arguments: { query: "refactor" },
    });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toEqual({
      notes: [{ id: "1", title: "TDD basics" }],
    });
  });

  it("reports downstream failures as a tool error and stays healthy", async () => {
    const c = await connect({ repo: fakeRepo({ failWith: new Error("db down") }) });
    close = c.close;
    const res = await c.client.callTool({
      name: "search_notes",
      arguments: { query: "x" },
    });
    expect(res.isError).toBe(true);
    const text = JSON.stringify(res.content);
    expect(text).toMatch(/temporarily unavailable/i);
    expect(text).not.toMatch(/db down|stack/i);

    const { tools } = await c.client.listTools();
    expect(tools.length).toBeGreaterThan(0);
  });
});
```

## Adapter

Write this only after the tests above fail.

```ts
// src/tools/searchNotes.tool.ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchNotes, DomainError } from "../domain/searchNotes";
import type { Deps } from "../server";

export function registerSearchNotes(server: McpServer, deps: Deps) {
  server.registerTool(
    "search_notes",
    {
      title: "Search notes",
      description:
        "Search the user's notes by keyword in title or body. " +
        "Use when the user asks to find or recall a note. Returns at most `limit` results.",
      inputSchema: {
        query: z.string().max(500).describe("Keywords to match, case-insensitive"),
        limit: z.number().int().min(1).max(50).default(10)
          .describe("Maximum number of notes to return"),
      },
      outputSchema: {
        notes: z.array(z.object({ id: z.string(), title: z.string() })),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, limit }) => {
      try {
        const notes = await searchNotes({ query, limit }, deps);
        const structured = { notes: notes.map(({ id, title }) => ({ id, title })) };
        return {
          content: [{ type: "text", text: JSON.stringify(structured) }],
          structuredContent: structured,
        };
      } catch (err) {
        deps.logger?.error(err);
        const message = err instanceof DomainError
          ? err.userMessage
          : "Notes are temporarily unavailable. Try again shortly.";
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }
  );
}
```
