# Live TUI check in tmux

Load this page before driving a real pi TUI from an agent (for example to verify narration colors against a saved session).

## Safe procedure

- **Work on a copy** - Copy the session file to a temporary directory and pass both `--session <copy>` and `--session-dir <tmpdir>`. Compare the original's hash before and after; delete the copies afterwards.
- **Isolate pi** - Run `COLORTERM=truecolor pi --session <copy> --session-dir <tmpdir> -ne --no-mcp -na -nc -ns -np --use-theme dark -e ./src/index.ts` in a detached tmux session you create (`tmux new-session -d -s <name> -x 150 -y 60`), never in an existing user pane. Opening a session and rendering history needs no model request.
- **Capture** - `tmux capture-pane -t <name> -e -p -S -5000` keeps SGR codes and scrollback. Dark theme reference: `text` 222;224;225, `thinkingText` 150;160;164, `accent` and `mdCode` 167;152;215.
- **Exit pi with `/quit`, not Ctrl+C** - Ctrl+C clears the editor and exits only when pressed twice within 500 ms (`interactive-mode.js` `handleCtrlC`); Ctrl+D exits only when the editor is empty. Send `C-c`, then `/quit` with `send-keys -l`, then `Enter`. Before sending any shell command, confirm `tmux list-panes -t <name> -F '#{pane_current_command}'` shows the shell, not `node`: keystrokes sent while pi is running are submitted as a user message and trigger a real model request. (2026-10-27 checkpoint for work item `261027-2019-show-claude-narration-as-visible-reply-text`: two Ctrl+C presses one second apart left pi running and a typed shell command went to the provider.)
- **Clean up** - `tmux kill-session -t <name>` and remove the temporary directory.
