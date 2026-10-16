# Tracing of Claude Code to Langfuse

Use this reference when you set up, change or repair the Langfuse tracing of Claude Code sessions (the Stop hook of the Langfuse integration guide).

## Procedure

1. Get the current guide first: `https://langfuse.com/integrations/developer-tools/claude-code.md`. Use the hook script of the guide as the base. Do not write the script from memory.
2. Put the hook in the repository: `.claude/hooks/langfuse_hook.py`. Register it as a `Stop` hook in `.claude/settings.json` of the repository (not in `~/.claude/settings.json`), unless the user asks for tracing in all projects.
   - Do not call `python3` directly in the hook command. On Windows, a python.org installation has no `python3` command. Use a Node launcher, `.claude/hooks/langfuse-hook.mjs`. The launcher stops at once if `TRACE_TO_LANGFUSE` is not `"true"`. Then it finds a Python that has the langfuse package (`LANGFUSE_PYTHON`, then `python3`, `python`, `py -3`) and sends stdin to the script. If it finds no Python, it writes an error and gives exit code 1.
   - Use an absolute path in the command: `node "$CLAUDE_PROJECT_DIR/.claude/hooks/langfuse-hook.mjs"`.
   - Add the `env` block with placeholder values to `.claude/settings.local.example.json` (in git), so that a new computer has a template.
3. Put the keys and the switch in `.claude/settings.local.json` (git must ignore this file), in the `env` block: `TRACE_TO_LANGFUSE`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`. Do not ask the user to paste the keys into the chat.
4. Always make the two changes below to the script of the guide: the state folder and the on/off file.
5. Do the test in the section "Test".
6. Tell the user how to turn tracing on and off (refer to the section "Tell the user").

## Change 1: the state folder

The guide keeps the state and the log in `~/.claude/state/`. Change this: keep them in the repository, in `.claude/langfuse-state/`.

```python
# Changed from the Langfuse guide (Path.home() / ".claude" / "state"): keep the state in this
# repository (.claude/langfuse-state/, git ignores it), so the integration writes nothing in ~/.claude.
STATE_DIR = Path(__file__).resolve().parent.parent / "langfuse-state"
LOG_FILE = STATE_DIR / "langfuse_hook.log"
STATE_FILE = STATE_DIR / "langfuse_state.json"
LOCK_FILE = STATE_DIR / "langfuse_state.lock"
```

- Make the folder `.claude/langfuse-state/`.
- Add `.claude/langfuse-state/` to `.gitignore`. The state and the log can contain personal data.

## Change 2: the on/off file

The `env` block of the settings is read only when a session starts. Thus a change to `TRACE_TO_LANGFUSE` has no effect before a restart. The file `.claude/langfuse-state/off` lets the user stop and start tracing with no restart. The hook looks for the file at each Stop.

Add the path after the other paths:

```python
# When this file exists, tracing is paused. Read at each Stop, so no restart is necessary.
OFF_FILE = STATE_DIR / "off"
```

In `main()`, after the checks of `session_id` and `transcript_path` and before the Langfuse client is made, add:

```python
    if OFF_FILE.exists():
        # Paused: move the offset past the new turns, so that they are not sent when tracing starts again.
        try:
            with FileLock(LOCK_FILE):
                state = load_state()
                key = state_key(session_id, str(transcript_path))
                ss = load_session_state(state, key)
                _, ss = read_new_jsonl(transcript_path, ss)
                write_session_state(state, key, ss)
                save_state(state)
            debug(f"Tracing paused ({OFF_FILE} exists); skipped new turns")
        except Exception as e:
            debug(f"Pause skip failed: {e}")
        return 0
```

Important: while the file exists, the hook must move the offset forward. If it only returns, the turns made during the pause are sent when the user removes the file.

Also add these lines to the docstring at the top of the script:

```
To stop tracing with no restart, make the file .claude/langfuse-state/off. Remove it to start again.
The turns made while this file exists are skipped: they are not sent later.
```

Do not make the `off` file during the setup, unless the user wants tracing to be off at the start.

If the names of the functions in the new guide are different, adapt the code. Keep the same behavior.

## Test

Do the test on a copy of the hook in a temporary folder `<tmp>/.claude/hooks/`, so that the state goes to `<tmp>/.claude/langfuse-state/`. Use test keys and a server address that does not exist (for example `http://127.0.0.1:9`). Send the payload `{"session_id": "s1", "transcript_path": "<tmp>/t.jsonl"}` on stdin, with `TRACE_TO_LANGFUSE=true` and `CC_LANGFUSE_DEBUG=true`.

1. Write one turn (one user line and one assistant line) in `t.jsonl` and make the `off` file. Run the hook. Make sure that the offset in `langfuse_state.json` is the size of `t.jsonl`, that `turn_count` is 0, and that the log shows "Tracing paused".
2. Remove the `off` file and run the hook again. Make sure that the log shows no new "Processed" line.
3. Add one more turn and run the hook. Make sure that the log shows "Processed 1 turns".

Remove the temporary folder after the test.

## Tell the user

- To turn tracing off: `New-Item .claude/langfuse-state/off` (PowerShell) or `touch .claude/langfuse-state/off` (Bash).
- To turn tracing on: `Remove-Item .claude/langfuse-state/off` (PowerShell) or `rm .claude/langfuse-state/off` (Bash).
- The change starts at the next turn. No restart is necessary.
- `TRACE_TO_LANGFUSE` has priority: if it is not `"true"`, tracing stays off and the file has no effect. A change to `TRACE_TO_LANGFUSE` starts only in a new session.
