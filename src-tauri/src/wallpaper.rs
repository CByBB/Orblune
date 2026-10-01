//! Live wallpaper host: one WorkerW-backed window per monitor.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO, MONITORINFOEXW,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowExW, FindWindowW, GetParent, GetSystemMetrics, GetWindow,
    GetWindowLongPtrW, GetWindowRect, SendMessageTimeoutW, SetParent, SetWindowLongPtrW,
    SetWindowPos, GWL_EXSTYLE, GW_CHILD, GW_HWNDNEXT, HWND_BOTTOM, SMTO_NORMAL,
    SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SWP_NOACTIVATE,
    SWP_NOZORDER, SWP_SHOWWINDOW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
    WS_EX_TRANSPARENT,
};

static ATTACHED: AtomicBool = AtomicBool::new(false);
static LAST_ERROR: Mutex<Option<String>> = Mutex::new(None);
static ATTACH_LOCK: Mutex<()> = Mutex::new(());
/// Last explicitly requested enabled monitor keys. `None` means “all monitors”.
static LAST_ENABLED_KEYS: Mutex<Option<Vec<String>>> = Mutex::new(None);

#[derive(Debug, Clone)]
struct MonitorRect {
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperStatus {
    pub attached: bool,
    pub error: Option<String>,
    pub virtual_width: i32,
    pub virtual_height: i32,
    pub virtual_x: i32,
    pub virtual_y: i32,
    pub monitor_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfoDto {
    pub index: u32,
    pub key: String,
    pub name: String,
    pub width: i32,
    pub height: i32,
}

fn set_error(msg: impl Into<String>) {
    if let Ok(mut guard) = LAST_ERROR.lock() {
        *guard = Some(msg.into());
    }
}

fn clear_error() {
    if let Ok(mut guard) = LAST_ERROR.lock() {
        *guard = None;
    }
}

fn hwnd_ok(result: windows::core::Result<HWND>) -> HWND {
    result.unwrap_or_default()
}

fn is_null(hwnd: HWND) -> bool {
    hwnd.0.is_null()
}

fn utf16_to_string(buf: &[u16]) -> String {
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len])
}

fn device_display_name(device_key: &str) -> String {
    // "\\.\DISPLAY1" → "Display 1"
    let tail = device_key.rsplit('\\').next().unwrap_or(device_key);
    if let Some(num) = tail.strip_prefix("DISPLAY").or_else(|| tail.strip_prefix("Display")) {
        if !num.is_empty() && num.chars().all(|c| c.is_ascii_digit()) {
            return format!("Display {num}");
        }
    }
    if tail.is_empty() {
        device_key.to_string()
    } else {
        tail.to_string()
    }
}

unsafe extern "system" fn enum_worker_w(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let shelldll = hwnd_ok(FindWindowExW(
        Some(hwnd),
        None,
        windows::core::w!("SHELLDLL_DefView"),
        None,
    ));
    if is_null(shelldll) {
        return BOOL(1);
    }
    let worker = hwnd_ok(FindWindowExW(
        None,
        Some(hwnd),
        windows::core::w!("WorkerW"),
        None,
    ));
    if !is_null(worker) {
        let out = lparam.0 as *mut HWND;
        *out = worker;
        return BOOL(0);
    }
    BOOL(1)
}

fn find_worker_w() -> Option<HWND> {
    unsafe {
        let progman = hwnd_ok(FindWindowW(windows::core::w!("Progman"), None));
        if is_null(progman) {
            return None;
        }

        let _ = SendMessageTimeoutW(
            progman,
            0x052C,
            WPARAM(0),
            LPARAM(0),
            SMTO_NORMAL,
            1000,
            None,
        );

        let mut worker = HWND::default();
        let _ = EnumWindows(Some(enum_worker_w), LPARAM(&mut worker as *mut _ as isize));
        if !is_null(worker) {
            return Some(worker);
        }

        let mut child = hwnd_ok(GetWindow(progman, GW_CHILD));
        while !is_null(child) {
            let view = hwnd_ok(FindWindowExW(
                Some(child),
                None,
                windows::core::w!("SHELLDLL_DefView"),
                None,
            ));
            if !is_null(view) {
                let next = hwnd_ok(FindWindowExW(
                    None,
                    Some(child),
                    windows::core::w!("WorkerW"),
                    None,
                ));
                if !is_null(next) {
                    return Some(next);
                }
            }
            child = hwnd_ok(GetWindow(child, GW_HWNDNEXT));
        }
        None
    }
}

fn virtual_screen() -> (i32, i32, i32, i32) {
    unsafe {
        (
            GetSystemMetrics(SM_XVIRTUALSCREEN),
            GetSystemMetrics(SM_YVIRTUALSCREEN),
            GetSystemMetrics(SM_CXVIRTUALSCREEN),
            GetSystemMetrics(SM_CYVIRTUALSCREEN),
        )
    }
}

unsafe extern "system" fn monitor_enum_proc(
    hmonitor: HMONITOR,
    _hdc: HDC,
    _lprc: *mut RECT,
    lparam: LPARAM,
) -> BOOL {
    let list = &mut *(lparam.0 as *mut Vec<MonitorRect>);
    let mut info = MONITORINFOEXW::default();
    info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    if GetMonitorInfoW(hmonitor, &mut info as *mut _ as *mut MONITORINFO).as_bool() {
        let r = info.monitorInfo.rcMonitor;
        let key = utf16_to_string(&info.szDevice);
        list.push(MonitorRect {
            x: r.left,
            y: r.top,
            w: r.right - r.left,
            h: r.bottom - r.top,
            key: if key.is_empty() {
                format!("monitor-{}x{}", r.left, r.top)
            } else {
                key
            },
        });
    }
    BOOL(1)
}

fn list_monitors() -> Vec<MonitorRect> {
    unsafe {
        let mut list = Vec::new();
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(monitor_enum_proc),
            LPARAM(&mut list as *mut _ as isize),
        );
        if list.is_empty() {
            let (vx, vy, vw, vh) = virtual_screen();
            list.push(MonitorRect {
                x: vx,
                y: vy,
                w: vw,
                h: vh,
                key: "\\\\.\\DISPLAY1".into(),
            });
        }
        // Stable order: left-to-right, then top-to-bottom
        list.sort_by(|a, b| a.x.cmp(&b.x).then(a.y.cmp(&b.y)));
        list
    }
}

fn wallpaper_label(index: usize) -> String {
    if index == 0 {
        "wallpaper".to_string()
    } else {
        format!("wallpaper-{index}")
    }
}

fn prepare_window_styles(hwnd: HWND) {
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let new_ex = ex
            | WS_EX_TOOLWINDOW.0
            | WS_EX_NOACTIVATE.0
            | WS_EX_TRANSPARENT.0
            | WS_EX_LAYERED.0;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_ex as isize);
    }
}

fn ensure_wallpaper_window(app: &AppHandle, index: usize) -> Result<WebviewWindow, String> {
    let label = wallpaper_label(index);
    if let Some(existing) = app.get_webview_window(&label) {
        return Ok(existing);
    }

    WebviewWindowBuilder::new(app, &label, WebviewUrl::App("wallpaper.html".into()))
        .title(format!("Orblune Wallpaper {index}"))
        .decorations(false)
        // Opaque host: acrylic taskbars flicker less than with a transparent layered window.
        .transparent(false)
        .skip_taskbar(true)
        .visible(false)
        .resizable(false)
        .focused(false)
        .shadow(false)
        .inner_size(800.0, 600.0)
        .build()
        .map_err(|e| format!("Could not create wallpaper window {index}: {e}"))
}

fn prune_extra_windows(app: &AppHandle, keep: usize) {
    // Remove dynamically created wallpaper-N windows beyond current monitor count.
    // Keep the primary "wallpaper" window even if unused briefly.
    let mut index = keep.max(1);
    loop {
        let label = wallpaper_label(index);
        if label == "wallpaper" {
            index += 1;
            continue;
        }
        let Some(win) = app.get_webview_window(&label) else {
            break;
        };
        let _ = win.close();
        index += 1;
        if index > 16 {
            break;
        }
    }
}

fn window_needs_reattach(hwnd: HWND, worker: HWND, monitor: &MonitorRect) -> bool {
    unsafe {
        let parent = GetParent(hwnd).unwrap_or_default();
        if parent != worker {
            return true;
        }
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return true;
        }
        let w = rect.right - rect.left;
        let h = rect.bottom - rect.top;
        rect.left != monitor.x || rect.top != monitor.y || w != monitor.w || h != monitor.h
    }
}

fn attach_window_to_monitor(
    window: &WebviewWindow,
    monitor: &MonitorRect,
    force: bool,
) -> Result<(), String> {
    let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0 as *mut _);

    let worker = find_worker_w().ok_or_else(|| {
        "Could not find the desktop WorkerW window. Explorer may still be starting.".to_string()
    })?;

    // Skip SetParent/SetWindowPos when already correctly hosted — avoids acrylic taskbar flicker.
    if !force && !window_needs_reattach(hwnd, worker, monitor) {
        let _ = window.set_ignore_cursor_events(true);
        return Ok(());
    }

    unsafe {
        prepare_window_styles(hwnd);
        SetParent(hwnd, Some(worker)).map_err(|e| e.to_string())?;

        // After SetParent, coordinates are relative to WorkerW (virtual desktop host).
        let mut worker_rect = RECT::default();
        GetWindowRect(worker, &mut worker_rect).map_err(|e| e.to_string())?;
        let rel_x = monitor.x - worker_rect.left;
        let rel_y = monitor.y - worker_rect.top;

        SetWindowPos(
            hwnd,
            Some(HWND_BOTTOM),
            rel_x,
            rel_y,
            monitor.w,
            monitor.h,
            SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_NOZORDER,
        )
        .map_err(|e| e.to_string())?;
    }

    let _ = window.set_ignore_cursor_events(true);
    let _ = window.show();
    Ok(())
}

fn detach_window(window: &WebviewWindow) -> Result<(), String> {
    let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0 as *mut _);
    unsafe {
        SetParent(hwnd, None).map_err(|e| e.to_string())?;
    }
    let _ = window.hide();
    Ok(())
}

fn wallpaper_windows(app: &AppHandle) -> Vec<WebviewWindow> {
    let mut out = Vec::new();
    for index in 0..17 {
        let label = wallpaper_label(index);
        if let Some(win) = app.get_webview_window(&label) {
            out.push(win);
        } else if index > 0 {
            break;
        }
    }
    out
}

fn resolve_enabled_filter(enabled_keys: Option<Vec<String>>) -> Option<Vec<String>> {
    match enabled_keys {
        Some(keys) => {
            if let Ok(mut guard) = LAST_ENABLED_KEYS.lock() {
                *guard = Some(keys.clone());
            }
            Some(keys)
        }
        None => LAST_ENABLED_KEYS
            .lock()
            .ok()
            .and_then(|g| g.clone()),
    }
}

fn monitor_is_enabled(monitor: &MonitorRect, filter: &Option<Vec<String>>) -> bool {
    match filter {
        None => true,
        Some(keys) => keys.iter().any(|k| k == &monitor.key),
    }
}

pub fn attach_all(
    app: &AppHandle,
    enabled_keys: Option<Vec<String>>,
    force: bool,
) -> Result<(), String> {
    let _guard = ATTACH_LOCK
        .lock()
        .map_err(|_| "Wallpaper attach lock poisoned".to_string())?;
    let filter = resolve_enabled_filter(enabled_keys);
    let monitors = list_monitors();
    if monitors.is_empty() {
        return Err("No monitors found".into());
    }

    prune_extra_windows(app, monitors.len());

    // Keep the primary wallpaper window alive so it can drive re-attach.
    let _ = ensure_wallpaper_window(app, 0);

    let mut any = false;
    for (index, monitor) in monitors.iter().enumerate() {
        let enabled = monitor_is_enabled(monitor, &filter);
        if enabled {
            let window = ensure_wallpaper_window(app, index)?;
            attach_window_to_monitor(&window, monitor, force)?;
            any = true;
        } else if let Some(window) = app.get_webview_window(&wallpaper_label(index)) {
            let _ = detach_window(&window);
            if index > 0 {
                let _ = window.close();
            }
        }
    }

    ATTACHED.store(any, Ordering::SeqCst);
    clear_error();
    Ok(())
}

pub fn detach_all(app: &AppHandle) -> Result<(), String> {
    let _guard = ATTACH_LOCK
        .lock()
        .map_err(|_| "Wallpaper attach lock poisoned".to_string())?;
    let mut last_err: Option<String> = None;
    for window in wallpaper_windows(app) {
        if let Err(e) = detach_window(&window) {
            last_err = Some(e);
        }
    }
    ATTACHED.store(false, Ordering::SeqCst);
    if let Some(e) = last_err {
        return Err(e);
    }
    Ok(())
}

pub fn status(app: &AppHandle) -> WallpaperStatus {
    let (vx, vy, vw, vh) = virtual_screen();
    let error = LAST_ERROR.lock().ok().and_then(|g| g.clone());
    let monitors = list_monitors();
    let any_visible = wallpaper_windows(app)
        .iter()
        .any(|w| w.is_visible().unwrap_or(false));
    WallpaperStatus {
        attached: ATTACHED.load(Ordering::SeqCst) && any_visible,
        error,
        virtual_width: vw,
        virtual_height: vh,
        virtual_x: vx,
        virtual_y: vy,
        monitor_count: monitors.len() as u32,
    }
}

#[tauri::command]
pub fn wallpaper_status(app: AppHandle) -> WallpaperStatus {
    status(&app)
}

#[tauri::command]
pub fn wallpaper_list_monitors() -> Vec<MonitorInfoDto> {
    list_monitors()
        .into_iter()
        .enumerate()
        .map(|(index, m)| MonitorInfoDto {
            index: index as u32,
            name: device_display_name(&m.key),
            key: m.key,
            width: m.w,
            height: m.h,
        })
        .collect()
}

#[tauri::command]
pub fn wallpaper_attach(
    app: AppHandle,
    enabled_keys: Option<Vec<String>>,
) -> Result<WallpaperStatus, String> {
    match attach_all(&app, enabled_keys, true) {
        Ok(()) => Ok(status(&app)),
        Err(e) => {
            set_error(e.clone());
            ATTACHED.store(false, Ordering::SeqCst);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn wallpaper_detach(app: AppHandle) -> Result<WallpaperStatus, String> {
    detach_all(&app)?;
    Ok(status(&app))
}

#[tauri::command]
pub fn wallpaper_primary_bounds(app: AppHandle) -> Result<(i32, i32, i32, i32), String> {
    let monitors = list_monitors();
    let m = monitors
        .first()
        .cloned()
        .ok_or_else(|| "Could not read primary monitor".to_string())?;
    let _ = app;
    Ok((m.x, m.y, m.w, m.h))
}

pub fn spawn_reattach_loop(app: AppHandle) {
    std::thread::spawn(move || loop {
        // Slow health check only — avoid periodic SetParent (acrylic taskbar flicker).
        std::thread::sleep(std::time::Duration::from_secs(30));
        if !ATTACHED.load(Ordering::SeqCst) {
            continue;
        }
        if let Err(e) = attach_all(&app, None, false) {
            set_error(e);
        }
    });
}
