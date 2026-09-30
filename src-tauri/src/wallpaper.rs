//! Live wallpaper host: attach the wallpaper window to the desktop WorkerW layer.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewWindow};
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTOPRIMARY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowExW, FindWindowW, GetSystemMetrics, GetWindow, GetWindowLongPtrW,
    SendMessageTimeoutW, SetParent, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, GW_CHILD,
    GW_HWNDNEXT, HWND_BOTTOM, SMTO_NORMAL, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
    SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SWP_NOACTIVATE, SWP_NOZORDER, SWP_SHOWWINDOW,
    WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
};

static ATTACHED: AtomicBool = AtomicBool::new(false);
static LAST_ERROR: Mutex<Option<String>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperStatus {
    pub attached: bool,
    pub error: Option<String>,
    pub virtual_width: i32,
    pub virtual_height: i32,
    pub virtual_x: i32,
    pub virtual_y: i32,
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

fn primary_monitor_rect(hwnd: HWND) -> Option<(i32, i32, i32, i32)> {
    unsafe {
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTOPRIMARY);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if GetMonitorInfoW(monitor, &mut info).as_bool() {
            let r: RECT = info.rcMonitor;
            Some((r.left, r.top, r.right - r.left, r.bottom - r.top))
        } else {
            None
        }
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

pub fn attach_wallpaper_window(window: &WebviewWindow) -> Result<(), String> {
    let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0 as *mut _);

    let worker = find_worker_w().ok_or_else(|| {
        "Could not find the desktop WorkerW window. Explorer may still be starting.".to_string()
    })?;

    unsafe {
        prepare_window_styles(hwnd);
        SetParent(hwnd, Some(worker)).map_err(|e| e.to_string())?;

        let (vx, vy, vw, vh) = virtual_screen();
        SetWindowPos(
            hwnd,
            Some(HWND_BOTTOM),
            vx,
            vy,
            vw,
            vh,
            SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_NOZORDER,
        )
        .map_err(|e| e.to_string())?;
    }

    let _ = window.set_ignore_cursor_events(true);
    let _ = window.show();
    ATTACHED.store(true, Ordering::SeqCst);
    clear_error();
    Ok(())
}

pub fn detach_wallpaper_window(window: &WebviewWindow) -> Result<(), String> {
    let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0 as *mut _);
    unsafe {
        SetParent(hwnd, None).map_err(|e| e.to_string())?;
    }
    let _ = window.hide();
    ATTACHED.store(false, Ordering::SeqCst);
    Ok(())
}

pub fn status(window: Option<&WebviewWindow>) -> WallpaperStatus {
    let (vx, vy, vw, vh) = virtual_screen();
    let error = LAST_ERROR.lock().ok().and_then(|g| g.clone());
    WallpaperStatus {
        attached: ATTACHED.load(Ordering::SeqCst)
            && window
                .map(|w| w.is_visible().unwrap_or(false))
                .unwrap_or(false),
        error,
        virtual_width: vw,
        virtual_height: vh,
        virtual_x: vx,
        virtual_y: vy,
    }
}

pub fn primary_frame(window: &WebviewWindow) -> Option<(i32, i32, i32, i32)> {
    let hwnd = HWND(window.hwnd().ok()?.0 as *mut _);
    primary_monitor_rect(hwnd)
}

#[tauri::command]
pub fn wallpaper_status(app: AppHandle) -> WallpaperStatus {
    let win = app.get_webview_window("wallpaper");
    status(win.as_ref())
}

#[tauri::command]
pub fn wallpaper_attach(app: AppHandle) -> Result<WallpaperStatus, String> {
    let window = app
        .get_webview_window("wallpaper")
        .ok_or_else(|| "Wallpaper window missing".to_string())?;
    match attach_wallpaper_window(&window) {
        Ok(()) => Ok(status(Some(&window))),
        Err(e) => {
            set_error(e.clone());
            ATTACHED.store(false, Ordering::SeqCst);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn wallpaper_detach(app: AppHandle) -> Result<WallpaperStatus, String> {
    let window = app
        .get_webview_window("wallpaper")
        .ok_or_else(|| "Wallpaper window missing".to_string())?;
    detach_wallpaper_window(&window)?;
    Ok(status(Some(&window)))
}

#[tauri::command]
pub fn wallpaper_primary_bounds(app: AppHandle) -> Result<(i32, i32, i32, i32), String> {
    let window = app
        .get_webview_window("wallpaper")
        .ok_or_else(|| "Wallpaper window missing".to_string())?;
    primary_frame(&window).ok_or_else(|| "Could not read primary monitor".to_string())
}

pub fn spawn_reattach_loop(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(8));
        if !ATTACHED.load(Ordering::SeqCst) {
            continue;
        }
        if let Some(window) = app.get_webview_window("wallpaper") {
            if let Err(e) = attach_wallpaper_window(&window) {
                set_error(e);
            }
        }
    });
}
