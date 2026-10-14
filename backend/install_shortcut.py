"""Create (or refresh) the Study Space shortcut in the Windows Start Menu.

The shortcut launches desktop.py with pythonw.exe (no console window), uses
assets/icon.ico, and carries the same AppUserModelID that desktop.py sets at
runtime, so the taskbar shows the app's icon and pinning works as expected.

    python install_shortcut.py             # create/update the shortcut
    python install_shortcut.py --desktop   # also put one on the Desktop
    python install_shortcut.py --remove    # remove the shortcut(s)
"""

import argparse
import os
import sys
from pathlib import Path

import pythoncom
from win32com.client import Dispatch
from win32com.propsys import propsys, pscon
from win32com.shell import shellcon

from desktop import APP_USER_MODEL_ID, ICON_PATH, WINDOW_TITLE

BACKEND_DIR = Path(__file__).resolve().parent
LAUNCHER = BACKEND_DIR / 'desktop.py'
SHORTCUT_NAME = f'{WINDOW_TITLE}.lnk'


def start_menu_dir() -> Path:
    return Path(os.environ['APPDATA']) / 'Microsoft' / 'Windows' / 'Start Menu' / 'Programs'


def desktop_dir() -> Path:
    from win32com.shell import shell

    return Path(shell.SHGetFolderPath(0, shellcon.CSIDL_DESKTOPDIRECTORY, None, 0))


def pythonw_path() -> Path:
    pythonw = Path(sys.executable).with_name('pythonw.exe')
    return pythonw if pythonw.is_file() else Path(sys.executable)


def create_shortcut(path: Path):
    shell = Dispatch('WScript.Shell')
    link = shell.CreateShortcut(str(path))
    link.TargetPath = str(pythonw_path())
    link.Arguments = f'"{LAUNCHER}"'
    link.WorkingDirectory = str(BACKEND_DIR)
    link.IconLocation = f'{ICON_PATH},0'
    link.Description = WINDOW_TITLE
    link.Save()

    # WScript.Shell cannot set the AppUserModelID; write it through the property store.
    store = propsys.SHGetPropertyStoreFromParsingName(
        str(path), None, shellcon.GPS_READWRITE, propsys.IID_IPropertyStore
    )
    store.SetValue(pscon.PKEY_AppUserModel_ID, propsys.PROPVARIANTType(APP_USER_MODEL_ID, pythoncom.VT_LPWSTR))
    store.Commit()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description='Install the Study Space Start Menu shortcut')
    parser.add_argument('--desktop', action='store_true', help='also create a Desktop shortcut')
    parser.add_argument('--remove', action='store_true', help='remove the shortcut(s) instead')
    args = parser.parse_args(argv)

    targets = [start_menu_dir() / SHORTCUT_NAME]
    if args.desktop or args.remove:
        targets.append(desktop_dir() / SHORTCUT_NAME)

    for target in targets:
        if args.remove:
            if target.exists():
                target.unlink()
                print(f'Removed {target}')
        else:
            create_shortcut(target)
            print(f'Created {target}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
