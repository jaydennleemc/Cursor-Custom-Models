use crate::cursor;
use crate::error::{AppError, Result};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

pub fn cursor_is_running() -> bool {
    #[cfg(target_os = "macos")]
    {
        Command::new("pgrep")
            .args(["-x", "Cursor"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq Cursor.exe", "/NH"])
            .output()
            .map(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .to_ascii_lowercase()
                    .contains("cursor.exe")
            })
            .unwrap_or(false)
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        false
    }
}

pub fn app_bundle_from_resource_root(root: &Path) -> Option<PathBuf> {
    root.ancestors().find(|p| p.extension().is_some_and(|e| e == "app")).map(Path::to_path_buf)
}

#[cfg(any(target_os = "windows", test))]
pub fn windows_exe_from_resource_root(root: &Path) -> PathBuf {
    root.join("../../Cursor.exe")
}

pub fn open_cursor() -> Result<String> {
    #[cfg(target_os = "macos")]
    {
        let app = cursor::discover()
            .ok()
            .and_then(|install| app_bundle_from_resource_root(&install.root))
            .unwrap_or_else(|| PathBuf::from("/Applications/Cursor.app"));
        if !app.exists() {
            return Err(AppError::msg(format!("Cursor app not found: {}", app.display())));
        }
        Command::new("open")
            .arg(&app)
            .spawn()
            .map_err(|e| AppError::msg(format!("Could not open Cursor: {e}")))?;
        if wait_until(cursor_is_running, Duration::from_secs(4)) {
            return Ok(format!("Opened {}", app.display()));
        }
        Ok(format!("Launched {} (still starting)", app.display()))
    }

    #[cfg(target_os = "windows")]
    {
        let exe = cursor::discover()
            .ok()
            .map(|install| windows_exe_from_resource_root(&install.root))
            .unwrap_or_else(|| {
                let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
                PathBuf::from(local).join("Programs/cursor/Cursor.exe")
            });
        if !exe.is_file() {
            return Err(AppError::msg(format!("Cursor.exe not found: {}", exe.display())));
        }
        Command::new(&exe)
            .spawn()
            .map_err(|e| AppError::msg(format!("Could not open Cursor: {e}")))?;
        if wait_until(cursor_is_running, Duration::from_secs(4)) {
            return Ok(format!("Opened {}", exe.display()));
        }
        Ok(format!("Launched {} (still starting)", exe.display()))
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err(AppError::msg("Open Cursor is only supported on macOS and Windows"))
    }
}

pub fn quit_cursor() -> Result<String> {
    if !cursor_is_running() {
        return Ok("Cursor is not running".into());
    }

    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("osascript")
            .args(["-e", "tell application \"Cursor\" to quit"])
            .status();
        if wait_until(|| !cursor_is_running(), Duration::from_secs(3)) {
            return Ok("Cursor quit".into());
        }
        let _ = Command::new("pkill").args(["-x", "Cursor"]).status();
        let _ = Command::new("killall").arg("Cursor").status();
        if wait_until(|| !cursor_is_running(), Duration::from_secs(2)) {
            return Ok("Cursor quit (forced)".into());
        }
        Err(AppError::msg("Cursor is still running (check the menu-bar extra)"))
    }

    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/IM", "Cursor.exe", "/T"])
            .status();
        if wait_until(|| !cursor_is_running(), Duration::from_secs(3)) {
            return Ok("Cursor quit".into());
        }
        let _ = Command::new("taskkill")
            .args(["/IM", "Cursor.exe", "/T", "/F"])
            .status();
        if wait_until(|| !cursor_is_running(), Duration::from_secs(2)) {
            return Ok("Cursor quit (forced)".into());
        }
        Err(AppError::msg("Cursor is still running (check the tray icon)"))
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Err(AppError::msg("Quit Cursor is only supported on macOS and Windows"))
    }
}

fn wait_until(pred: impl Fn() -> bool, timeout: Duration) -> bool {
    let started = Instant::now();
    loop {
        if pred() {
            return true;
        }
        if started.elapsed() >= timeout {
            return pred();
        }
        thread::sleep(Duration::from_millis(150));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundle_path_walks_up_to_app() {
        let root = PathBuf::from("/Applications/Cursor.app/Contents/Resources/app");
        assert_eq!(
            app_bundle_from_resource_root(&root).as_deref(),
            Some(Path::new("/Applications/Cursor.app"))
        );
    }

    #[test]
    fn windows_exe_sits_two_levels_above_resources_app() {
        let root = PathBuf::from(r"C:\Users\me\AppData\Local\Programs\cursor\resources\app");
        assert!(windows_exe_from_resource_root(&root)
            .ends_with(Path::new("Cursor.exe")));
    }
}
