# study-space

## Desktop mode

Run Study Space as a local, single-user desktop app: one process, no Docker,
Postgres, Redis, Celery worker/beat, login or emails. It uses SQLite, in-memory
channels/cache, runs the periodic tasks in-process (APScheduler), stores images
on disk, and opens in a native window (pywebview).

The regular Docker / `pnpm dev` setup is unchanged; desktop mode is opt-in
(`config.settings.desktop` and `vite build --mode desktop`).

Requirements: Python 3.12+, Node.js and pnpm. On Windows pywebview uses the
WebView2 runtime (preinstalled on Windows 11).

```bat
setup-desktop.bat   :: once: creates backend\.venv, installs deps, builds the frontend,
                    ::       adds a "Study Space" shortcut to the Start Menu
StudySpace.bat      :: launch (no console window)
```

The Start Menu shortcut uses `backend/assets/icon.ico` and can be pinned to the
taskbar. Manage it with `backend\.venv\Scripts\python backend\install_shortcut.py`
(`--desktop` adds a Desktop shortcut too, `--remove` deletes them).

Manual equivalent:

```bash
cd frontend && pnpm install && pnpm build:desktop      # output: frontend/dist-desktop
cd ../backend && python -m venv .venv && .venv/Scripts/pip install -r requirements-desktop.txt
.venv/Scripts/python desktop.py                        # --no-window to serve headless
```

- Data (database, uploads, log, secret key) lives in `%LOCALAPPDATA%\StudySpace`
  (`~/.studyspace` if unset). Override with the `STUDYSPACE_DATA_DIR` env var.
- The app listens on `127.0.0.1:47615` (a random free port if that one is
  busy). Keeping the port stable preserves browser storage such as theme and
  reader preferences.
- Pending migrations are applied automatically at startup.
- Session reminders are not delivered in desktop mode: emails are disabled and
  there is no in-app notification channel yet.
- After pulling frontend changes, rerun `pnpm build:desktop`.
