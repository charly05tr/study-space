"""Desktop launcher: Study Space as a single-process, single-user app.

Starts uvicorn (ASGI app) and an APScheduler in background threads, then shows
the app in a native pywebview window. Closing the window stops everything.

    python desktop.py              # open the window
    python desktop.py --no-window  # headless: serve until Ctrl+C
"""

import argparse
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings.desktop'
sys.path.insert(0, str(Path(__file__).resolve().parent))

# pythonw.exe has no console: stdout/stderr are None, which breaks anything that
# writes to them. Django logging goes to a file (see settings/desktop.py).
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')

from config.paths import bundle_root, is_frozen  # noqa: E402

WINDOW_TITLE = 'Study Space'
HOST = '127.0.0.1'
# A stable port keeps the origin -- and therefore localStorage (theme, reader
# preferences) -- the same between launches. Falls back to any free port.
PREFERRED_PORT = 47615
ICON_PATH = bundle_root() / 'assets' / 'icon.ico'
# Must match the AppUserModelID stamped on the Start Menu shortcut
# (install_shortcut.py) so the taskbar groups the window under that shortcut
# and shows its icon instead of pythonw.exe's.
APP_USER_MODEL_ID = 'StudySpace.Desktop'


# WebView2 does not map F11 to anything, so the page forwards it to the native
# window. The flag guards against double registration if `loaded` fires again.
F11_LISTENER_JS = """
if (!window.__studyspaceF11) {
  window.__studyspaceF11 = true;
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'F11') return;
    event.preventDefault();
    window.pywebview.api.toggle_fullscreen();
  });
}
"""


class WindowApi:
    """Methods exposed to the page as `window.pywebview.api`."""

    def __init__(self):
        # Underscore: pywebview does not expose (or walk into) private attributes.
        self._window = None

    def toggle_fullscreen(self):
        if self._window is not None:
            self._window.toggle_fullscreen()


def set_app_user_model_id():
    if sys.platform != 'win32':
        return
    import ctypes

    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_USER_MODEL_ID)


def bind_socket(preferred: int) -> socket.socket:
    for port in (preferred, 0):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.bind((HOST, port))
        except OSError:
            sock.close()
            continue
        sock.listen(128)
        return sock
    raise RuntimeError('Could not bind a local port')


def prepare_django():
    import django
    from django.conf import settings
    from django.core.management import call_command
    from django.db import connection
    from django.db.migrations.executor import MigrationExecutor

    django.setup()

    executor = MigrationExecutor(connection)
    if executor.migration_plan(executor.loader.graph.leaf_nodes()):
        call_command('migrate', interactive=False, verbosity=0)

    # WhiteNoise scans STATIC_ROOT when the ASGI app is built, so collect first.
    # Frozen builds ship it pre-collected (read-only install dir), so skip there.
    # The admin's static folder is the marker that it was already collected.
    if not is_frozen() and not (Path(settings.STATIC_ROOT) / 'admin').is_dir():
        call_command('collectstatic', interactive=False, verbosity=0)

    # Create the local user now so the first request does not pay for it.
    from apps.core.authentication import get_local_user

    get_local_user()


def start_server(sock: socket.socket):
    import uvicorn
    from django.core.asgi import get_asgi_application

    config = uvicorn.Config(
        get_asgi_application(),
        log_config=None,
        access_log=False,
        lifespan='off',
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, kwargs={'sockets': [sock]}, daemon=True, name='uvicorn')
    thread.start()
    return server, thread


def wait_until_ready(url: str, timeout: float = 30.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            urllib.request.urlopen(url, timeout=2).close()
            return
        except urllib.error.HTTPError:
            return  # The server answered, whatever the status.
        except OSError:
            time.sleep(0.1)
    raise RuntimeError(f'Server did not respond at {url} within {timeout:.0f}s')


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Study Space desktop launcher')
    parser.add_argument('--no-window', action='store_true', help='serve headless until Ctrl+C')
    parser.add_argument('--port', type=int, default=PREFERRED_PORT, help='preferred local port (0 = any free)')
    args = parser.parse_args(argv)

    prepare_django()

    from django.conf import settings

    from config.desktop_scheduler import build_scheduler

    sock = bind_socket(args.port)
    port = sock.getsockname()[1]
    url = f'http://{HOST}:{port}/'

    server, thread = start_server(sock)
    scheduler = build_scheduler()
    scheduler.start()

    try:
        wait_until_ready(f'{url}api/')
        print(f'Study Space running at {url}', flush=True)

        if args.no_window:
            try:
                while thread.is_alive():
                    time.sleep(0.5)
            except KeyboardInterrupt:
                pass
        else:
            import webview

            set_app_user_model_id()
            api = WindowApi()
            window = webview.create_window(
                WINDOW_TITLE, url, width=1360, height=860, min_size=(900, 600), js_api=api
            )
            api._window = window
            window.events.loaded += lambda: window.evaluate_js(F11_LISTENER_JS)
            storage = Path(settings.DATA_DIR) / 'webview'
            storage.mkdir(parents=True, exist_ok=True)
            # private_mode=False + storage_path keep cookies/localStorage across launches.
            webview.start(private_mode=False, storage_path=str(storage), icon=str(ICON_PATH))
    finally:
        scheduler.shutdown(wait=False)
        server.should_exit = True
        thread.join(timeout=10)
        sock.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
