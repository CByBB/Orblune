# Custom NSIS notes for Orblune
#
# Tauri 2 already drives the installer from `tauri.conf.json`:
# - installMode: currentUser  → %LOCALAPPDATA%, no elevation
# - targets: nsis only        → single setup .exe
# - webviewInstallMode downloadBootstrapper when WebView2 is missing
#
# Keep this folder for future hooks (custom welcome bitmap, language).
# Do not add component pages or directory pages — Orblune stays one-click.
