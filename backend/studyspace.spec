# PyInstaller spec for the Study Space desktop app (onedir, windowed).
#
# Run from backend/ via build-desktop.bat. Inputs that must exist beforehand:
#   - ../frontend/dist-desktop   (pnpm build:desktop)
#   - build/staticfiles          (collectstatic with STUDYSPACE_STATIC_ROOT)
import os
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

BACKEND = Path(SPECPATH)
FRONTEND_DIST = BACKEND.parent / 'frontend' / 'dist-desktop'
STATIC_BUILD = BACKEND / 'build' / 'staticfiles'

# PyInstaller's Django hook imports the settings module at analysis time. Use a
# throwaway data dir so building never touches the real user data.
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings.desktop'
os.environ.setdefault('STUDYSPACE_DATA_DIR', str(BACKEND / 'build' / 'data'))

for required in (FRONTEND_DIST / 'index.html', STATIC_BUILD / 'admin'):
    if not required.exists():
        raise SystemExit(f'Missing build input: {required}')


def _not_gis(name: str) -> bool:
    # GIS is removed from INSTALLED_APPS in desktop mode and needs GDAL.
    return not name.startswith('django.contrib.gis')


datas = [
    (str(BACKEND / 'config' / 'templates'), 'config/templates'),
    (str(BACKEND / 'assets' / 'icon.ico'), 'assets'),
    (str(FRONTEND_DIST), 'frontend-dist'),
    (str(STATIC_BUILD), 'staticfiles'),
]
hiddenimports = []

# Project code: loaded through INSTALLED_APPS / ROOT_URLCONF / dotted-path settings.
# Walk the tree instead of collect_submodules: some folders (apps/core/adapters)
# are namespace packages without __init__.py, which collect_submodules skips.
for top in ('apps', 'config'):
    for py in (BACKEND / top).rglob('*.py'):
        rel = py.relative_to(BACKEND).with_suffix('')
        parts = rel.parts[:-1] if rel.name == '__init__' else rel.parts
        hiddenimports.append('.'.join(parts))

# Third-party packages Django, DRF, uvicorn & co. import from strings.
for pkg in (
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_nested',
    'drf_spectacular',
    'django_filters',
    'corsheaders',
    'channels',
    'daphne',
    'autobahn',  # daphne -> autobahn.nvx reads its own .c source at import time
    'twisted',
    'txaio',
    'anymail',
    'whitenoise',
    'uvicorn',
    'apscheduler',
    'webview',
    'pymupdf',
    'pymupdf4llm',
    'celery',
    'kombu',
    'cloudinary',
):
    hiddenimports += collect_submodules(pkg)
    datas += collect_data_files(pkg)

hiddenimports += collect_submodules('django', filter=_not_gis)
datas += collect_data_files('django', excludes=['**/contrib/gis/**'])

# Pulled in by uvicorn[standard] and sqlite; harmless if absent.
hiddenimports += ['h11', 'websockets', 'wsproto', 'httptools', 'sqlite3', 'decouple']

a = Analysis(
    [str(BACKEND / 'desktop.py')],
    pathex=[str(BACKEND)],
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=['tkinter', 'silk', 'psycopg', 'psycopg_binary'],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='StudySpace',
    console=False,
    icon=str(BACKEND / 'assets' / 'icon.ico'),
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name='StudySpace', upx=False)
