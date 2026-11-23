use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, LogicalSize, Manager, Size, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_notification::NotificationExt;

const LIVE_BASE_URL: &str = "https://nebrija-proyectos-bien.vercel.app";

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
            let open_item = MenuItem::with_id(app, "open", "Abrir Proyectos Nebrija App", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Salir completamente", true, None::<&str>)?;
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
