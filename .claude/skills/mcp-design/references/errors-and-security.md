# Error mapping and security cases

## Error mapping

Write a test for each row that applies to the tool.

| Situation | Expected behaviour |
|---|---|
| Arguments violate the input schema | Rejected before the handler runs; the message names the offending field |
| Valid schema, invalid domain value (e.g. unknown ID) | `isError: true`; the message says what was wrong and how to fix it |
| Transient downstream failure | `isError: true`; generic, retryable message; details only in logs |
| Permission or auth failure | `isError: true`; states which permission is missing; never echoes tokens |
| Unknown tool name | Protocol-level error |
| Unexpected exception | Caught and logged; `isError: true`; server keeps serving |
| Cancellation by the client | Work stops promptly with no partial side effects (test with an abort signal) |

A model reads these messages to decide its next step. Assert that each is specific, actionable and free of internal details.

## Security cases

Pick the cases that match the tool's arguments and side effects. Write them early, not at the end.

- **Paths:** reject traversal (`../../etc/passwd`), absolute paths outside the allowed root, and symlink escapes.
- **Injection:** never interpolate arguments into shell commands, SQL or query strings. Test with injection payloads (`; rm -rf /`, `' OR 1=1 --`).
- **Untrusted content:** text the tool fetches from outside is data. If it is returned to the client, test that it is clearly delimited or labelled as external.
- **Secrets:** values from environment or config never appear in results, error messages or default-level logs.
- **Destructive tools:** required arguments scope the action (no "delete everything" by omitting a filter), and the tool is annotated `destructiveHint: true`.
- **Resource limits:** oversized inputs and outputs are capped; large result sets are paginated or truncated.
- **HTTP transport:** unauthenticated requests are rejected; Origin and Host headers are validated.
