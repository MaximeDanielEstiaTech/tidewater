# Tracing of Claude Code to Langfuse

Use this reference when you set up, change or repair the Langfuse tracing of Claude Code sessions (the Stop hook of the Langfuse integration guide).

Tracing is always off by default. It is on only when the file `.claude/langfuse-state/on` exists.

## Procedure

1. Get the current guide first: `https://langfuse.com/integrations/developer-tools/claude-code.md`. Use the hook script of the guide as the base. Do not write the script from memory.
2. Put the hook in the repository: `.claude/hooks/langfuse_hook.py`. Register it as a `Stop` hook in `.claude/settings.json` of the repository (not in `~/.claude/settings.json`), unless the user asks for tracing in all projects.
   - Do not call `python3` directly in the hook command. On Windows, a python.org installation has no `python3` command. Use a Node launcher, `.claude/hooks/langfuse-hook.mjs`. The launcher stops at once if `.claude/langfuse-state/on` does not exist, so Python is not necessary when tracing is off. Then it finds a Python that has the langfuse package (`LANGFUSE_PYTHON`, then `python3`, `python`, `py -3`) and sends stdin to the script. If it finds no Python, it writes an error and gives exit code 1.
   - Use an absolute path in the command: `node "$CLAUDE_PROJECT_DIR/.claude/hooks/langfuse-hook.mjs"`.
   - Add the `env` block with placeholder keys to `.claude/settings.local.example.json` (in git), so that a new computer has a template.
3. Put the keys in `.claude/settings.local.json` (git must ignore this file), in the `env` block: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`. Do not use `TRACE_TO_LANGFUSE`: the `on` file replaces it. Do not ask the user to paste the keys into the chat.
4. Always make the two changes below to the script of the guide: the state folder and the `on` file.
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

## Change 2: the `on` file

The `env` block of the settings is read only when a session starts. The file `.claude/langfuse-state/on` lets the user start and stop tracing with no restart. The hook looks for the file at each Stop.

Add the path after the other paths:

```python
# Tracing is on only when this file exists. Read at each Stop, so no restart is necessary.
ON_FILE = STATE_DIR / "on"
```

At the start of `main()`, in place of the check of `TRACE_TO_LANGFUSE`, add:

```python
    try:
        on_since = datetime.fromtimestamp(ON_FILE.stat().st_mtime, tz=timezone.utc)
    except OSError:
        return 0  # Off by default: no "on" file.
```

Replace `turns = build_turns(msgs)` with:

```python
            # Send only the turns that started after the "on" file was made. The earlier turns
            # (tracing off) are read and skipped, so they are never sent.
            all_turns = build_turns(msgs)
            turns = [t for t in all_turns if (parse_ts(t.user_msg) or on_since) > on_since]
            if len(turns) < len(all_turns):
                debug(f"Skipped {len(all_turns) - len(turns)} turns from before {on_since.isoformat()}")
```

Important: when tracing is off, the hook does not move the offset forward (Python does not run). Thus, when the user makes the `on` file, the hook reads the turns made while tracing was off. The filter on the time of the file makes sure that these turns are not sent.

Also put these lines in the docstring at the top of the script:

```
Tracing is off by default. It is on only when the file .claude/langfuse-state/on exists, and the
keys are set (in .claude/settings.local.json). No restart is necessary to make or remove the file.
Only the turns that start after the file was made are sent. The earlier turns are skipped.
```

Do not make the `on` file during the setup, unless the user asks for tracing to be on.

If the names of the functions in the new guide are different, adapt the code. Keep the same behavior.

## Test

Do the test on a copy of the hooks in a temporary folder `<tmp>/.claude/hooks/`, so that the state goes to `<tmp>/.claude/langfuse-state/`. Use test keys and a server address that does not exist (for example `http://127.0.0.1:9`). Run the launcher `node <tmp>/.claude/hooks/langfuse-hook.mjs`, and send the payload `{"session_id": "s1", "transcript_path": "<tmp>/t.jsonl"}` on stdin, with `CC_LANGFUSE_DEBUG=true`. Use the current time in the timestamps of the turns.

1. Write one turn (one user line and one assistant line) in `t.jsonl`, with no `on` file. Run the hook. Make sure that the exit code is 0 and that the log is empty (the launcher stopped).
2. Make the `on` file. Run the hook again. Make sure that the log shows "Skipped 1 turns" and no "Processed" line.
3. Add one more turn with a later time and run the hook. Make sure that the log shows "Processed 1 turns".

Remove the temporary folder after the test.

## Tell the user

- To turn tracing on: `New-Item -Force .claude/langfuse-state/on` (PowerShell) or `touch .claude/langfuse-state/on` (Bash).
- To turn tracing off: `Remove-Item .claude/langfuse-state/on` (PowerShell) or `rm .claude/langfuse-state/on` (Bash).
- The change starts at the next turn. No restart is necessary.
- Only the turns after the `on` file was made are sent.
