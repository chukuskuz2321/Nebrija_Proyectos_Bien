use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const APP_PAYLOAD: &[u8] = include_bytes!("../payload/proyectos-nebrija-app.exe");
const APP_USER_MODEL_ID: &str = "com.nebrija.proyectos.app";

#[derive(Clone, Serialize)]
struct InstallProgressPayload {
    percent: u8,
    message: String,
}

fn emit_progress(app: &AppHandle, percent: u8, message: &str) {
    let _ = app.emit(
        "install-progress",
        InstallProgressPayload {
            percent,
            message: message.to_string(),
        },
    );
}

fn get_install_dir() -> Result<PathBuf, String> {
    let local_app_data = std::env::var("LOCALAPPDATA")
        .map_err(|_| "No se pudo localizar la carpeta %LOCALAPPDATA% de Windows.".to_string())?;
    Ok(PathBuf::from(local_app_data).join("ProyectosNebrija"))
}

fn get_installed_exe_path() -> Result<PathBuf, String> {
    Ok(get_install_dir()?.join("ProyectosNebrijaApp.exe"))
}

#[cfg(windows)]
fn run_powershell(script: &str) -> Result<(), String> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Error ejecutando configuracion de Windows: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("PowerShell devolvio un error: {}", stderr.trim()));
    }
    Ok(())
}

#[cfg(not(windows))]
fn run_powershell(_script: &str) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
async fn perform_install(
    app: AppHandle,
    autostart: bool,
    desktop_shortcut: bool,
) -> Result<String, String> {
    emit_progress(&app, 18, "Preparando carpeta local %LOCALAPPDATA%\\ProyectosNebrija...");
    let install_dir = get_install_dir()?;
    fs::create_dir_all(&install_dir)
        .map_err(|e| format!("No se pudo crear la carpeta de instalacion: {}", e))?;

    emit_progress(&app, 45, "Instalando ejecutable principal de Proyectos Nebrija App...");
    let exe_path = get_installed_exe_path()?;
    fs::write(&exe_path, APP_PAYLOAD)
        .map_err(|e| format!("No se pudo escribir el ejecutable (cierra la app si estaba abierta): {}", e))?;

    let exe_str = exe_path.to_string_lossy().replace('\'', "''");
    let dir_str = install_dir.to_string_lossy().replace('\'', "''");

    emit_progress(&app, 72, "Registrando AppUserModelID para notificaciones de Windows...");

    let ps_script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$exePath = '{exe}'
$installDir = '{dir}'
$aumid = '{aumid}'

$startMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$startShortcut = Join-Path $startMenuDir 'Proyectos Nebrija App.lnk'

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($startShortcut)
$sc.TargetPath = $exePath
$sc.WorkingDirectory = $installDir
$sc.Description = 'Proyectos Nebrija App - Gestion de proyectos y widgets en tiempo real'
$sc.IconLocation = "$exePath,0"
$sc.Save()

# Stamp System.AppUserModel.ID on the Start Menu shortcut so Windows Action Center notifications work
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class ShortcutAumid {{
    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    private class ShellLink {{}}

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("0000010b-0000-0000-C000-000000000046")]
    private interface IPersistFile {{
        void GetClassID(out Guid pClassID);
        int IsDirty();
        void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
        void Save([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, bool fRemember);
        void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);
        void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName);
    }}

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    private struct PropertyKey {{
        public Guid fmtid;
        public uint pid;
    }}

    [StructLayout(LayoutKind.Explicit)]
    private struct PropVariant {{
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public IntPtr ptr;
    }}

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
    private interface IPropertyStore {{
        uint GetCount(out uint cProps);
        uint GetAt(uint iProp, out PropertyKey pkey);
        uint GetValue(ref PropertyKey key, out PropVariant pv);
        uint SetValue(ref PropertyKey key, ref PropVariant pv);
        uint Commit();
    }}

    public static void SetAumid(string shortcutPath, string aumid) {{
        var link = new ShellLink();
        var persist = (IPersistFile)link;
        persist.Load(shortcutPath, 2);
        var store = (IPropertyStore)link;
        var key = new PropertyKey {{ fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 }};
        var pv = new PropVariant {{ vt = 31, ptr = Marshal.StringToCoTaskMemUni(aumid) }};
        try {{
            store.SetValue(ref key, ref pv);
            store.Commit();
            persist.Save(shortcutPath, true);
        }} finally {{
            Marshal.FreeCoTaskMem(pv.ptr);
        }}
    }}
}}
"@ -ErrorAction SilentlyContinue

try {{
    [ShortcutAumid]::SetAumid($startShortcut, $aumid)
}} catch {{
    # Fallback gracefully if COM property stamp is restricted
}}

if ({desktop_shortcut}) {{
    $desktopDir = [Environment]::GetFolderPath('Desktop')
    $desktopShortcutPath = Join-Path $desktopDir 'Proyectos Nebrija App.lnk'
    $dsc = $ws.CreateShortcut($desktopShortcutPath)
    $dsc.TargetPath = $exePath
    $dsc.WorkingDirectory = $installDir
    $dsc.Description = 'Proyectos Nebrija App'
    $dsc.IconLocation = "$exePath,0"
    $dsc.Save()
}}

$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
if ({autostart}) {{
    Set-ItemProperty -Path $runKey -Name 'ProyectosNebrijaApp' -Value "`"$exePath`" --autostart"
}} else {{
    Remove-ItemProperty -Path $runKey -Name 'ProyectosNebrijaApp' -ErrorAction SilentlyContinue
}}

# Register clean per-user entry in Windows Settings > Installed Apps
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ProyectosNebrijaApp'
New-Item -Path $uninstallKey -Force | Out-Null
Set-ItemProperty -Path $uninstallKey -Name 'DisplayName' -Value 'Proyectos Nebrija App'
Set-ItemProperty -Path $uninstallKey -Name 'DisplayVersion' -Value '1.0.0'
Set-ItemProperty -Path $uninstallKey -Name 'Publisher' -Value 'Proyectos Nebrija App'
Set-ItemProperty -Path $uninstallKey -Name 'DisplayIcon' -Value $exePath
Set-ItemProperty -Path $uninstallKey -Name 'InstallLocation' -Value $installDir
Set-ItemProperty -Path $uninstallKey -Name 'NoModify' -Value 1 -Type DWord
Set-ItemProperty -Path $uninstallKey -Name 'NoRepair' -Value 1 -Type DWord
$uninstallCmd = "powershell -NoProfile -WindowStyle Hidden -Command `"Stop-Process -Name ProyectosNebrijaApp -Force -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force '$installDir' -ErrorAction SilentlyContinue; Remove-Item -Force '$startShortcut' -ErrorAction SilentlyContinue; Remove-ItemProperty -Path '$runKey' -Name 'ProyectosNebrijaApp' -ErrorAction SilentlyContinue; Remove-Item -Recurse -Force '$uninstallKey' -ErrorAction SilentlyContinue`""
Set-ItemProperty -Path $uninstallKey -Name 'UninstallString' -Value $uninstallCmd
"#,
        exe = exe_str,
        dir = dir_str,
        aumid = APP_USER_MODEL_ID,
        desktop_shortcut = if desktop_shortcut { "$true" } else { "$false" },
        autostart = if autostart { "$true" } else { "$false" }
    );

    run_powershell(&ps_script)?;

    emit_progress(&app, 92, "Verificando accesos directos y finalizando...");
    emit_progress(&app, 100, "Proyectos Nebrija App instalada correctamente.");

    Ok(exe_path.to_string_lossy().to_string())
}

#[tauri::command]
fn launch_installed_app(app: AppHandle) -> Result<(), String> {
    let exe_path = get_installed_exe_path()?;
    Command::new(&exe_path)
        .spawn()
        .map_err(|e| format!("No se pudo iniciar la aplicacion: {}", e))?;
    app.exit(0);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            perform_install,
            launch_installed_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Proyectos Nebrija Setup");
}
