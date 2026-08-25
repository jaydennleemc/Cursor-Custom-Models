// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(all(target_os = "macos", debug_assertions))]
    macos_reexec_as_display_name();
    cursor_custom_model_lib::run()
}

/// `tauri dev` runs the Cargo binary (`cursor-gateway`). macOS Dock labels
/// that file name. Copy + exec as `Cursor Gateway` so the Dock matches productName.
#[cfg(all(target_os = "macos", debug_assertions))]
fn macos_reexec_as_display_name() {
    use std::os::unix::process::CommandExt;

    const DISPLAY: &str = "Cursor Gateway";
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let Some(name) = exe.file_name().and_then(|n| n.to_str()) else {
        return;
    };
    if name == DISPLAY {
        return;
    }
    let dest = exe.with_file_name(DISPLAY);
    if std::fs::copy(&exe, &dest).is_err() {
        return;
    }
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let _ = std::process::Command::new(&dest).args(args).exec();
}
