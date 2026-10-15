# Python reference (official `mcp` SDK, pytest)

Check these imports and helper names against the installed `mcp` version. Adapt them if the API differs. Use the project's test runner and async plugin (`anyio` or `pytest-asyncio`).

## Contents
- Server factory
- Domain unit test
- Integration tests

## Server factory

Build the server from injected dependencies so tests can pass fakes.

```python
# app/server.py
from mcp.server.fastmcp import FastMCP
from app.domain.notes import search_notes, DomainError

def create_server(repo, logger=None) -> FastMCP:
    mcp = FastMCP("notes")

    @mcp.tool(
        name="search_notes",
        description=(
            "Search the user's notes by keyword in title or body. "
            "Use when the user asks to find or recall a note. "
            "Returns at most `limit` results."
        ),
    )
    async def search_notes_tool(query: str, limit: int = 10) -> dict:
        try:
            notes = await search_notes(query=query, limit=limit, repo=repo)
            return {"notes": [{"id": n.id, "title": n.title} for n in notes]}
        except DomainError as e:
            raise ValueError(e.user_message) from e  # surfaced as isError result

    return mcp
```

FastMCP turns exceptions raised in a tool into an `isError: true` result. Confirm that the message it produces does not include internal details, and catch unexpected exceptions yourself if it does.

## Domain unit test

```python
# tests/unit/test_search_notes.py
import pytest
from app.domain.notes import search_notes, Note

pytestmark = pytest.mark.anyio

class Repo:
    async def all(self):
        return [Note("1", "TDD basics", "red green refactor"), Note("2", "Groceries", "milk")]

@pytest.mark.parametrize("query,expected", [("REFACTOR", ["1"]), ("milk", ["2"]), ("zzz", [])])
async def test_matches_case_insensitively(query, expected):
    result = await search_notes(query=query, limit=10, repo=Repo())
    assert [n.id for n in result] == expected
```

## Integration tests

```python
# tests/integration/test_search_notes_tool.py
import pytest
from mcp.shared.memory import create_connected_server_and_client_session
from app.server import create_server
from tests.fixtures import FakeRepo

pytestmark = pytest.mark.anyio

async def test_tool_is_listed_with_required_query():
    server = create_server(repo=FakeRepo())
    async with create_connected_server_and_client_session(server._mcp_server) as client:
        tools = (await client.list_tools()).tools
        tool = next(t for t in tools if t.name == "search_notes")
        assert "query" in tool.inputSchema["required"]

async def test_returns_matching_notes():
    server = create_server(repo=FakeRepo())
    async with create_connected_server_and_client_session(server._mcp_server) as client:
        res = await client.call_tool("search_notes", {"query": "refactor"})
        assert not res.isError
        assert "TDD basics" in res.content[0].text

async def test_downstream_failure_is_tool_error_and_server_stays_up():
    server = create_server(repo=FakeRepo(fail_with=RuntimeError("db down")))
    async with create_connected_server_and_client_session(server._mcp_server) as client:
        res = await client.call_tool("search_notes", {"query": "x"})
        assert res.isError
        assert "db down" not in res.content[0].text
        assert (await client.list_tools()).tools
```

`server._mcp_server` is a private attribute; check whether the installed SDK version offers a public accessor or accepts the `FastMCP` instance directly.
