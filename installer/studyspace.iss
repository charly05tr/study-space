; Inno Setup script for Study Space. Compile through build-desktop.bat, which
; passes the version: ISCC /DAppVersion=1.2.3 studyspace.iss
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

#define AppName "Study Space"
#define AppExe "StudySpace.exe"
; Must match APP_USER_MODEL_ID in backend/desktop.py.
#define AppUserModelId "StudySpace.Desktop"

[Setup]
; Fixed GUID: never change it, upgrades rely on it to install over the old version.
AppId={{8F3C2B7E-5A41-4D9B-9E6A-2C1D7B4F0A53}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppName}
VersionInfoVersion={#AppVersion}
; Per-user by default; the user can pick "install for all users" in the dialog.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DefaultDirName={autopf}\StudySpace
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=StudySpace-Setup-{#AppVersion}
SetupIconFile=..\backend\assets\icon.ico
UninstallDisplayIcon={app}\{#AppExe}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\backend\dist\StudySpace\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"; AppUserModelID: "{#AppUserModelId}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; AppUserModelID: "{#AppUserModelId}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

; User data lives in %LOCALAPPDATA%\StudySpace and is intentionally NOT listed
; under [UninstallDelete]: uninstalling the app must never remove notes or sources.
