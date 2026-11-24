use serde::Serialize;
use std::collections::hash_map::RandomState;
use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, LogicalSize, Manager, Size, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_notification::NotificationExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const LIVE_BASE_URL: &str = "https://nebrija-proyectos-bien.vercel.app";

static LOGIN_CANCELLED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopAuthResult {
    id_token: String,
    access_token: String,
}

fn generate_state_nonce() -> String {
    let mut parts = String::with_capacity(32);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    for i in 0..4u64 {
        let rs = RandomState::new();
        let mut h = rs.build_hasher();
        h.write_u128(nanos);
        h.write_u64(i);
        h.write_u32(std::process::id());
        parts.push_str(&format!("{:08x}", (h.finish() & 0xffff_ffff) as u32));
    }
    parts
}

fn url_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = &input[i + 1..i + 3];
                if let Ok(val) = u8::from_str_radix(hex, 16) {
                    out.push(val);
                    i += 3;
                } else {
                    out.push(b'%');
                    i += 1;
                }
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

fn parse_form_urlencoded(body: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for pair in body.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            map.insert(url_decode(k), url_decode(v));
        }
    }
    map
}

fn open_in_default_browser(url: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("No se pudo abrir el navegador de Windows: {}", e))?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
}

fn sanitize_widget_label(id: &str) -> String {
    let cleaned: String = id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(40)
        .collect();
    if cleaned.is_empty() {
        "widget-default".to_string()
    } else {
        format!("widget-{}", cleaned)
    }
}

#[cfg(windows)]
fn apply_desktop_pin_state(window: &tauri::WebviewWindow, locked: bool) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_BOTTOM, HWND_NOTOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    };
    if let Ok(hwnd) = window.hwnd() {
        let insert_after = if locked { HWND_BOTTOM } else { HWND_NOTOPMOST };
        unsafe {
            let _ = SetWindowPos(
                hwnd.0 as _,
                insert_after,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
    }
}

#[cfg(not(windows))]
fn apply_desktop_pin_state(_window: &tauri::WebviewWindow, _locked: bool) {}

#[tauri::command]
fn cancel_desktop_browser_login() -> Result<(), String> {
    LOGIN_CANCELLED.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
async fn start_desktop_browser_login(
    app: AppHandle,
    mode: Option<String>,
) -> Result<DesktopAuthResult, String> {
    let auth_mode = match mode.as_deref() {
        Some("drive") => "drive",
        _ => "account",
    };

    LOGIN_CANCELLED.store(false, Ordering::SeqCst);
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("No se pudo iniciar el servidor local de autenticacion: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    listener
        .set_nonblocking(true)
        .map_err(|e| e.to_string())?;

    let state = generate_state_nonce();
    let auth_url = format!(
        "{}/desktop-auth?port={}&state={}&mode={}",
        LIVE_BASE_URL, port, state, auth_mode
    );
    open_in_default_browser(&auth_url)?;

    let expected_state = state.clone();
    let app_handle = app.clone();

    let result = tauri::async_runtime::spawn_blocking(move || -> Result<DesktopAuthResult, String> {
        let deadline = Instant::now() + Duration::from_secs(180);

        loop {
            if LOGIN_CANCELLED.load(Ordering::SeqCst) {
                return Err("Inicio de sesion cancelado por el usuario.".to_string());
            }
            if Instant::now() >= deadline {
                return Err("Tiempo agotado esperando la confirmacion en tu navegador.".to_string());
            }

            match listener.accept() {
                Ok((mut stream, _addr)) => {
                    let _ = stream.set_nonblocking(false);
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));

                    let mut buffer = Vec::with_capacity(4096);
                    let mut chunk = [0u8; 2048];
                    let mut header_end: Option<usize> = None;
                    let mut content_length: usize = 0;

                    while buffer.len() < 65536 {
                        match stream.read(&mut chunk) {
                            Ok(0) => break,
                            Ok(n) => {
                                buffer.extend_from_slice(&chunk[..n]);
                                if header_end.is_none() {
                                    if let Some(pos) =
                                        buffer.windows(4).position(|w| w == b"\r\n\r\n")
                                    {
                                        header_end = Some(pos + 4);
                                        let headers_str =
                                            String::from_utf8_lossy(&buffer[..pos]);
                                        for line in headers_str.lines() {
                                            if let Some((k, v)) = line.split_once(':') {
                                                if k.trim().eq_ignore_ascii_case("content-length") {
                                                    content_length = v.trim().parse().unwrap_or(0);
                                                }
                                            }
                                        }
                                    }
                                }
                                if let Some(h_end) = header_end {
                                    if buffer.len() >= h_end + content_length {
                                        break;
                                    }
                                }
                            }
                            Err(_) => break,
                        }
                    }

                    let h_end = match header_end {
                        Some(pos) => pos,
                        None => continue,
                    };
                    let head = String::from_utf8_lossy(&buffer[..h_end]);
                    let first_line = head.lines().next().unwrap_or("");

                    if first_line.starts_with("OPTIONS ") {
                        let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: https://nebrija-proyectos-bien.vercel.app\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nAccess-Control-Allow-Private-Network: true\r\nConnection: close\r\n\r\n";
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        continue;
                    }

                    if !first_line.contains("/auth-callback") {
                        let resp = "HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        continue;
                    }

                    let body_bytes = &buffer[h_end..buffer.len().min(h_end + content_length)];
                    let body_str = String::from_utf8_lossy(body_bytes);
                    let params = parse_form_urlencoded(&body_str);

                    let got_state = params.get("state").cloned().unwrap_or_default();
                    let id_token = params.get("idToken").cloned().unwrap_or_default();
                    let access_token = params.get("accessToken").cloned().unwrap_or_default();

                    if got_state != expected_state || (id_token.is_empty() && access_token.is_empty()) {
                        let err_html = "<!doctype html><html lang=\"es\"><body style=\"background:#09090B;color:#F4F4F6;font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0\"><div style=\"background:#0E0E12;border:1px solid #22222A;border-radius:16px;padding:28px;max-width:400px;text-align:center\"><h2>Solicitud no valida</h2><p style=\"color:#9C9CAF;font-size:13px\">Vuelve a iniciar sesion desde Proyectos Nebrija App.</p></div></body></html>";
                        let resp = format!(
                            "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            err_html.len(),
                            err_html
                        );
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        continue;
                    }

                    let ok_html = r#"<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Sesion iniciada · Proyectos Nebrija App</title>
  </head>
  <body style="background:#09090B;color:#F4F4F6;font-family:'Segoe UI',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px">
    <div style="background:#0E0E12;border:1px solid #22222A;border-radius:16px;padding:32px;max-width:420px;width:100%;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,0.55)">
      <svg width="48" height="48" viewBox="0 0 64 64" fill="none" style="margin:0 auto 14px;display:block">
        <rect x="2" y="2" width="60" height="60" rx="14" fill="#0E0E12" stroke="#282834" stroke-width="2" />
        <path d="M18 46V18H24.2L39.8 38.2V18H46V46H39.8L24.2 25.8V46H18Z" fill="#F4F4F6" />
        <rect x="39.8" y="18" width="6.2" height="10" rx="1.5" fill="#3B82F6" />
      </svg>
      <h1 style="font-size:19px;margin:0 0 8px">Sesion iniciada correctamente</h1>
      <p style="color:#9C9CAF;font-size:13px;line-height:1.5;margin:0">
        Ya puedes cerrar esta pestana y volver a <strong>Proyectos Nebrija App</strong>.
      </p>
    </div>
    <script>setTimeout(function(){ window.close(); }, 1800);</script>
  </body>
</html>"#;

                    let resp = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        ok_html.len(),
                        ok_html
                    );
                    let _ = stream.write_all(resp.as_bytes());
                    let _ = stream.flush();

                    if let Some(main) = app_handle.get_webview_window("main") {
                        let _ = main.unminimize();
                        let _ = main.show();
                        let _ = main.set_focus();
                    }

                    return Ok(DesktopAuthResult {
                        id_token,
                        access_token,
                    });
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(120));
                }
                Err(e) => return Err(format!("Error en servidor local de login: {}", e)),
            }
        }
    })
    .await
    .map_err(|e| format!("Error interno durante el login: {}", e))??;

    Ok(result)
}

#[tauri::command]
fn send_desktop_notification(app: AppHandle, title: String, body: String) -> Result<bool, String> {
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn open_widget_window(
    app: AppHandle,
    id: String,
    url_path: String,
    width: f64,
    height: f64,
    locked: bool,
    x: Option<f64>,
    y: Option<f64>,
) -> Result<bool, String> {
    let label = sanitize_widget_label(&id);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.set_size(Size::Logical(LogicalSize::new(width, height)));
        let _ = existing.show();
        apply_desktop_pin_state(&existing, locked);
        return Ok(true);
    }

    let safe_path = if url_path.starts_with('/') {
        url_path
    } else {
        format!("/widget?id={}", id)
    };
    let full_url = format!("{}{}", LIVE_BASE_URL, safe_path);
    let parsed_url = full_url.parse().map_err(|e| format!("Invalid widget URL: {}", e))?;

    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed_url))
        .title("Proyectos Nebrija Widget")
        .inner_size(width, height)
        .decorations(false)
        .transparent(true)
        .skip_taskbar(true)
        .shadow(false)
        .resizable(false)
        .always_on_bottom(locked);

    if let (Some(px), Some(py)) = (x, y) {
        builder = builder.position(px, py);
    }

    let win = builder.build().map_err(|e| e.to_string())?;
    apply_desktop_pin_state(&win, locked);
    Ok(true)
}

#[tauri::command]
fn close_widget_window(app: AppHandle, id: String) -> Result<bool, String> {
    let label = sanitize_widget_label(&id);
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.close();
    }
    Ok(true)
}

#[tauri::command]
fn set_widget_pinned(app: AppHandle, id: String, locked: bool) -> Result<bool, String> {
    let label = sanitize_widget_label(&id);
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.set_always_on_bottom(locked);
        apply_desktop_pin_state(&win, locked);
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
fn resize_widget_window(
    app: AppHandle,
    id: String,
    width: f64,
    height: f64,
) -> Result<bool, String> {
    let label = sanitize_widget_label(&id);
    if let Some(win) = app.get_webview_window(&label) {
        win.set_size(Size::Logical(LogicalSize::new(width, height)))
            .map_err(|e| e.to_string())?;
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
fn focus_main_window(
    app: AppHandle,
    _section: Option<String>,
    _project_id: Option<String>,
) -> Result<bool, String> {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
fn is_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart_enabled(app: AppHandle, enabled: bool) -> Result<bool, String> {
    if enabled {
        app.autolaunch().enable().map_err(|e| e.to_string())?;
    } else {
        app.autolaunch().disable().map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.unminimize();
                let _ = main.show();
                let _ = main.set_focus();
            }
        }))
        .setup(|app| {
            let open_item =
                MenuItem::with_id(app, "open", "Abrir Proyectos Nebrija App", true, None::<&str>)?;
            let quit_item =
                MenuItem::with_id(app, "quit", "Salir completamente", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Proyectos Nebrija App")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(main) = app.get_webview_window("main") {
                            let _ = main.unminimize();
                            let _ = main.show();
                            let _ = main.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(main) = app.get_webview_window("main") {
                            let _ = main.unminimize();
                            let _ = main.show();
                            let _ = main.set_focus();
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder.build(app)?;

            // Keep app running in background tray when main window closes so widgets and alerts stay alive
            if let Some(main_win) = app.get_webview_window("main") {
                let win_clone = main_win.clone();
                main_win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_desktop_browser_login,
            cancel_desktop_browser_login,
            send_desktop_notification,
            open_widget_window,
            close_widget_window,
            set_widget_pinned,
            resize_widget_window,
            focus_main_window,
            is_autostart_enabled,
            set_autostart_enabled,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Proyectos Nebrija App");
}
