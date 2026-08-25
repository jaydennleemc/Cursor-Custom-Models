use std::process::Command;

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
