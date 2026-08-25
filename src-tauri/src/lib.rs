mod checksum;
mod config;
mod connectivity;
mod cursor;
mod error;
mod patch;
mod process;
mod proxy;
mod restore;

use config::{AppConfig, ProxySettings};
use connectivity::ConnectionTest;
use cursor::TargetStatus;
use serde::Serialize;
use std::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppStatus {
    cursor_found: bool,
    cursor_root: Option<String>,
    cursor_running: bool,
    targets: Vec<TargetStatus>,
    product_json: Option<String>,
    config_path: String,
    proxy_running: bool,
    proxy_port: Option<u16>,
    proxy_upstream: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpResult {
    ok: bool,
    log: Vec<String>,
}

#[tauri::command]
fn get_status() -> Result<AppStatus, String> {
    let config_path = config::config_file_path()?.display().to_string();
    let px = proxy::status();
    let running = process::cursor_is_running();
    match cursor::discover() {
        Ok(install) => Ok(AppStatus {
            cursor_found: true,
            cursor_root: Some(install.root.display().to_string()),
            cursor_running: running,
            targets: cursor::target_statuses(&install),
            product_json: Some(install.product_json.display().to_string()),
            config_path,
            proxy_running: px.running,
            proxy_port: px.port,
            proxy_upstream: px.upstream,
        }),
        Err(_) => Ok(AppStatus {
            cursor_found: false,
            cursor_root: None,
            cursor_running: running,
            targets: Vec::new(),
            product_json: None,
            config_path,
            proxy_running: px.running,
            proxy_port: px.port,
            proxy_upstream: px.upstream,
        }),
    }
}

#[tauri::command]
fn get_config() -> Result<AppConfig, String> {
    Ok(config::load_config()?)
}

#[tauri::command]
fn save_config(config: AppConfig) -> Result<String, String> {
    let path = config::save_config(&config)?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn get_proxy_settings() -> Result<ProxySettings, String> {
    Ok(config::load_proxy()?)
}

#[tauri::command]
fn save_proxy_settings(settings: ProxySettings) -> Result<String, String> {
    let path = config::save_proxy(&settings)?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn start_patch(mut config: AppConfig) -> Result<OpResult, String> {
    if process::cursor_is_running() {
        return Err("Cursor is running. Fully quit Cursor (including the tray icon) before starting.".into());
    }
    config.enabled = true;
    if config.looks_unconfigured() {
        return Err("Enter a valid API key and Base URL (do not use a your- placeholder).".into());
    }
    config::save_config(&config)?;
    let install = cursor::discover()?;
    let mut log = Vec::new();
    log.push(format!("Cursor: {}", install.root.display()));
    let inject = match prepare_injected_config(&config, &mut log) {
        Ok(cfg) => cfg,
        Err(e) => {
            log.push(e.to_string());
            return Ok(OpResult { ok: false, log });
        }
    };
    match patch::patch_install(&install, &inject, &mut log) {
        Ok(()) => {
            log.push("Done. Fully quit Cursor, then reopen it.".into());
            Ok(OpResult { ok: true, log })
        }
        Err(e) => {
            log.push(e.to_string());
            Ok(OpResult { ok: false, log })
        }
    }
}

#[tauri::command]
fn stop_restore(force: bool) -> Result<OpResult, String> {
    if process::cursor_is_running() {
        return Err("Cursor is running. Fully quit Cursor (including the tray icon) before stopping.".into());
    }
    let install = cursor::discover()?;
    let mut log = Vec::new();
    match restore::restore_install(&install, force, &mut log) {
        Ok(()) => {
            log.push("Done. Fully quit Cursor, then reopen it.".into());
            Ok(OpResult { ok: true, log })
        }
        Err(e) => {
            log.push(e.to_string());
            Ok(OpResult { ok: false, log })
        }
    }
}

#[tauri::command]
fn start_proxy(settings: ProxySettings) -> Result<String, String> {
    config::save_proxy(&settings)?;
    proxy::start(settings.upstream.clone(), settings.port)?;
    Ok(format!(
        "Proxy started at http://127.0.0.1:{} → {}. For GLM you can set baseUrl to http://127.0.0.1:{}/api/paas/v4",
        settings.port, settings.upstream, settings.port
    ))
}

#[tauri::command]
fn stop_proxy() -> Result<String, String> {
    proxy::stop()?;
    Ok("Proxy stopped".into())
}

#[tauri::command]
fn default_config() -> AppConfig {
    AppConfig::default()
}

#[tauri::command]
async fn test_connection(config: AppConfig) -> Result<ConnectionTest, String> {
    tauri::async_runtime::spawn_blocking(move || connectivity::test_connection(&config))
        .await
        .map_err(|e| format!("Connection test failed: {e}"))?
        .map_err(Into::into)
}

fn prepare_injected_config(config: &AppConfig, log: &mut Vec<String>) -> Result<AppConfig, String> {
    let mut inject = config.clone();
    let px = config::load_proxy()?;
    if let Some((origin, rewritten)) = proxy::cors_proxy_rewrite(&inject.base_url, px.port) {
        proxy::ensure_running(origin.clone(), px.port)?;
        log.push(format!("CORS proxy {rewritten} → {origin}"));
        log.push("This upstream has no browser CORS. Traffic is rewritten through the built-in proxy. Keep this app running.".into());
        inject.base_url = rewritten;
    }
    Ok(inject)
}

#[tauri::command]
fn open_config_dir() -> Result<(), String> {
    let dir = config::config_dir_path()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = dir;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            if let (Ok(cfg), Ok(px)) = (config::load_config(), config::load_proxy()) {
                if let Some((origin, _)) = proxy::cors_proxy_rewrite(&cfg.base_url, px.port) {
                    let _ = proxy::ensure_running(origin, px.port);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            get_config,
            save_config,
            get_proxy_settings,
            save_proxy_settings,
            start_patch,
            stop_restore,
            start_proxy,
            stop_proxy,
            default_config,
            open_config_dir,
            test_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
