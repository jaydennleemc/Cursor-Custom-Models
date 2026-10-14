use crate::error::{AppError, Result};
use serde::Serialize;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

const DEFAULT_UPDATE_BASE: &str = "https://api2.cursor.sh/updates";
const DOWNLOAD_PAGE: &str = "https://cursor.com/downloads";
const MACHINE_ID: &str = "cursor-gateway";
const MAX_DOWNLOAD_BYTES: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorUpdate {
    pub available: bool,
    pub current: Option<String>,
    pub latest: Option<String>,
    pub url: Option<String>,
}

impl CursorUpdate {
    pub fn none() -> Self {
        Self {
            available: false,
            current: None,
            latest: None,
            url: None,
        }
    }

    fn current(version: String) -> Self {
        Self {
            available: false,
            current: Some(version),
            latest: None,
            url: None,
        }
    }
}

struct ProductMeta {
    version: String,
    update_url: String,
    app: String,
}

/// Ask Cursor's update feed whether this install is behind stable.
/// Network and parse failures stay quiet: the sidebar simply hides the button.
pub fn check() -> CursorUpdate {
    let Ok(install) = crate::cursor::discover() else {
        return CursorUpdate::none();
    };
    let Some(meta) = read_product(&install.product_json) else {
        return CursorUpdate::none();
    };
    let Some(feed) = feed_url(&meta.update_url, update_platform(), &meta.app, &meta.version) else {
        return CursorUpdate::current(meta.version);
    };
    match fetch_feed(&feed) {
        Ok((status, body)) => parse_feed(status, &body, &meta.version),
        Err(_) => CursorUpdate::current(meta.version),
    }
}

pub fn update_platform() -> &'static str {
    if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "darwin-arm64"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "darwin"
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "win32-arm64"
    } else if cfg!(target_os = "windows") {
        "win32-x64"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "linux-arm64"
    } else if cfg!(target_os = "linux") {
        "linux-x64"
    } else {
        "darwin-arm64"
    }
}

pub fn app_slug(name_short: &str) -> String {
    let slug: String = name_short
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_uppercase() {
                c.to_ascii_lowercase()
            } else if c == ' ' {
                '-'
            } else {
                c
            }
        })
        .collect();
    if path_segment(&slug).is_some() {
        slug
    } else {
        "cursor".to_string()
    }
}

/// `{updateUrl}/api/update/{platform}/{app}/{version}/cursor-gateway/stable`
pub fn feed_url(update_base: &str, platform: &str, app: &str, version: &str) -> Option<String> {
    let base = trusted_update_base(update_base)?;
    let platform = path_segment(platform)?;
    let app = path_segment(app)?;
    let version = path_segment(version)?;
    Some(format!(
        "{base}/api/update/{platform}/{app}/{version}/{MACHINE_ID}/stable"
    ))
}

pub fn parse_feed(status: u16, body: &str, current: &str) -> CursorUpdate {
    if status == 204 {
        return CursorUpdate::current(current.to_string());
    }
    if status != 200 {
        return CursorUpdate::current(current.to_string());
    }
    let Ok(json) = serde_json::from_str::<serde_json::Value>(body) else {
        return CursorUpdate::current(current.to_string());
    };
    let Some(latest) = latest_version(&json) else {
        return CursorUpdate::current(current.to_string());
    };
    if !version_is_newer(&latest, current) {
        return CursorUpdate::current(current.to_string());
    }
    let raw_url = json.get("url").and_then(|v| v.as_str()).unwrap_or("");
    let url = sanitize_download_url(raw_url).unwrap_or_else(|_| DOWNLOAD_PAGE.to_string());
    CursorUpdate {
        available: true,
        current: Some(current.to_string()),
        latest: Some(latest),
        url: Some(url),
    }
}

/// Save the official installer into the user's Downloads folder.
/// The feed URL is a zip or exe on downloads.cursor.com; this does not open a browser.
pub fn download_to_downloads(
    raw_url: &str,
    on_progress: &mut dyn FnMut(u64, Option<u64>),
) -> Result<PathBuf> {
    let filename = installer_filename(raw_url)?;
    let url = sanitize_download_url(raw_url)?;
    let dir = dirs::download_dir().ok_or_else(|| AppError::msg("Downloads folder was not found"))?;
    std::fs::create_dir_all(&dir)?;
    fetch_to_file(&url, &dir, &filename, on_progress)
}

pub fn installer_filename(raw: &str) -> Result<String> {
    let url = sanitize_download_url(raw)?;
    let parsed = reqwest::Url::parse(&url).map_err(|_| AppError::msg("Invalid download URL"))?;
    let segment = parsed
        .path_segments()
        .and_then(|mut parts| parts.next_back())
        .unwrap_or("");
    if segment.is_empty()
        || segment == "."
        || segment == ".."
        || !segment
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '+' | '-'))
    {
        return Err(AppError::msg("No direct installer link"));
    }
    let ext = segment
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(ext.as_str(), "zip" | "dmg" | "exe") || segment.len() <= ext.len() + 1 {
        return Err(AppError::msg("No direct installer link"));
    }
    Ok(segment.to_string())
}

pub fn sanitize_download_url(raw: &str) -> Result<String> {
    let url = reqwest::Url::parse(raw.trim()).map_err(|_| AppError::msg("Invalid download URL"))?;
    if url.scheme() != "https" {
        return Err(AppError::msg("Download URL must be https"));
    }
    let host = url.host_str().unwrap_or("");
    const ALLOWED: &[&str] = &[
        "downloads.cursor.com",
        "cursor.com",
        "www.cursor.com",
        "www.cursor.sh",
        "cursor.sh",
    ];
    if !ALLOWED.contains(&host) {
        return Err(AppError::msg("Download URL host is not allowed"));
    }
    let rendered = url.to_string();
    if !shell_safe(&rendered) {
        return Err(AppError::msg("Download URL is not safe to open"));
    }
    Ok(rendered)
}

pub fn version_is_newer(latest: &str, current: &str) -> bool {
    let latest_parts = version_parts(latest);
    let current_parts = version_parts(current);
    if latest_parts.is_empty() || current_parts.is_empty() {
        return false;
    }
    let len = latest_parts.len().max(current_parts.len());
    for i in 0..len {
        let next = latest_parts.get(i).copied().unwrap_or(0);
        let prev = current_parts.get(i).copied().unwrap_or(0);
        if next != prev {
            return next > prev;
        }
    }
    false
}

fn version_parts(value: &str) -> Vec<u64> {
    value
        .split(|c: char| !c.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse().ok())
        .collect()
}

fn latest_version(json: &serde_json::Value) -> Option<String> {
    for key in ["productVersion", "name", "version"] {
        if let Some(value) = json.get(key).and_then(|v| v.as_str()) {
            let value = value.trim();
            if looks_like_version(value) {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn looks_like_version(value: &str) -> bool {
    value.chars().next().is_some_and(|c| c.is_ascii_digit()) && path_segment(value).is_some()
}

fn path_segment(value: &str) -> Option<&str> {
    if value.is_empty() {
        return None;
    }
    if value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '+' | '-'))
    {
        Some(value)
    } else {
        None
    }
}

fn trusted_update_base(raw: &str) -> Option<String> {
    let url = reqwest::Url::parse(raw.trim()).ok()?;
    if url.scheme() != "https" {
        return None;
    }
    match url.host_str() {
        Some("api2.cursor.sh") | Some("cursorapi.com") => {
            let path = url.path().trim_end_matches('/');
            Some(format!("https://{}{path}", url.host_str()?))
        }
        _ => None,
    }
}

fn shell_safe(url: &str) -> bool {
    url.chars().all(|c| {
        c.is_ascii()
            && !c.is_control()
            && !matches!(c, ' ' | '"' | '&' | '|' | '<' | '>' | '^' | '\\' | '`')
    })
}

fn read_product(path: &Path) -> Option<ProductMeta> {
    let text = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    let version = json.get("version")?.as_str()?.trim();
    if path_segment(version).is_none() {
        return None;
    }
    let update_url = json
        .get("updateUrl")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|value| trusted_update_base(value).is_some())
        .unwrap_or(DEFAULT_UPDATE_BASE);
    let name = json
        .get("nameShort")
        .and_then(|v| v.as_str())
        .unwrap_or("Cursor");
    Some(ProductMeta {
        version: version.to_string(),
        update_url: update_url.to_string(),
        app: app_slug(name),
    })
}

fn unique_download_path(dir: &Path, filename: &str) -> Result<PathBuf> {
    let parsed = Path::new(filename);
    let stem = parsed
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::msg("No direct installer link"))?;
    let ext = parsed
        .extension()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::msg("No direct installer link"))?;
    for n in 0..100 {
        let name = if n == 0 {
            format!("{stem}.{ext}")
        } else {
            format!("{stem} {n}.{ext}")
        };
        let candidate = dir.join(name);
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(AppError::msg("Downloads folder already has this installer"))
}

/// `filename` is the installer name. Callers that already checked the URL may
/// point this at a test server; `download_to_downloads` only passes a Cursor URL.
pub fn fetch_to_file(
    url: &str,
    dir: &Path,
    filename: &str,
    on_progress: &mut dyn FnMut(u64, Option<u64>),
) -> Result<PathBuf> {
    let parsed = reqwest::Url::parse(url).map_err(|_| AppError::msg("Invalid download URL"))?;
    let origin_host = parsed
        .host_str()
        .ok_or_else(|| AppError::msg("Invalid download URL"))?
        .to_string();
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(15 * 60))
        .redirect(reqwest::redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() >= 8 {
                return attempt.error("too many redirects");
            }
            let next = attempt.url();
            let same_host = next.host_str() == Some(origin_host.as_str());
            let allowed = sanitize_download_url(next.as_str()).is_ok();
            if same_host || allowed {
                attempt.follow()
            } else {
                attempt.error("redirect host is not allowed")
            }
        }))
        .build()
        .map_err(|e| AppError::msg(e.to_string()))?;
    let mut response = client
        .get(url)
        .header("User-Agent", "CursorGateway")
        .send()
        .map_err(|e| AppError::msg(e.to_string()))?;
    let status = response.status();
    if !status.is_success() {
        return Err(AppError::msg(format!("Download failed ({status})")));
    }
    if let Some(kind) = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
    {
        if kind.to_ascii_lowercase().starts_with("text/html") {
            return Err(AppError::msg("No direct installer link"));
        }
    }
    let total = response.content_length();
    if let Some(total) = total {
        if total == 0 {
            return Err(AppError::msg("Installer download was empty"));
        }
        if total > MAX_DOWNLOAD_BYTES {
            return Err(AppError::msg("Installer is too large"));
        }
    }
    let dest = unique_download_path(dir, filename)?;
    let part = dest.with_extension(format!(
        "{}.part",
        dest.extension().and_then(|ext| ext.to_str()).unwrap_or("bin")
    ));
    let file = std::fs::File::create(&part)?;
    let received = match write_capped(&mut response, file, total, on_progress) {
        Ok(received) => received,
        Err(error) => {
            let _ = std::fs::remove_file(&part);
            return Err(error);
        }
    };
    if received == 0 || total.is_some_and(|expected| received != expected) {
        let _ = std::fs::remove_file(&part);
        return Err(AppError::msg("Installer download was incomplete"));
    }
    std::fs::rename(&part, &dest).map_err(|error| {
        let _ = std::fs::remove_file(&part);
        AppError::from(error)
    })?;
    Ok(dest)
}

fn write_capped(
    reader: &mut impl Read,
    mut file: impl Write,
    total: Option<u64>,
    on_progress: &mut dyn FnMut(u64, Option<u64>),
) -> Result<u64> {
    let mut buf = [0u8; 64 * 1024];
    let mut received: u64 = 0;
    let mut last_report: u64 = 0;
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        received += n as u64;
        if received > MAX_DOWNLOAD_BYTES {
            return Err(AppError::msg("Installer is too large"));
        }
        file.write_all(&buf[..n])?;
        let step = total.unwrap_or(1024 * 1024) / 100;
        let step = step.max(256 * 1024);
        if received - last_report >= step {
            last_report = received;
            on_progress(received, total);
        }
    }
    file.flush()?;
    Ok(received)
}

fn fetch_feed(url: &str) -> std::result::Result<(u16, String), String> {
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(url)
        .header("User-Agent", "CursorGateway")
        .send()
        .map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    if status == 204 {
        return Ok((204, String::new()));
    }
    let bytes = response.bytes().map_err(|e| e.to_string())?;
    if bytes.len() > 65_536 {
        return Err("update feed response is too large".into());
    }
    let body = String::from_utf8(bytes.to_vec()).map_err(|e| e.to_string())?;
    Ok((status, body))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feed_url_matches_cursor_update_service() {
        let url = feed_url(
            "https://api2.cursor.sh/updates",
            "darwin-arm64",
            "cursor",
            "3.21.16",
        )
        .unwrap();
        assert_eq!(
            url,
            "https://api2.cursor.sh/updates/api/update/darwin-arm64/cursor/3.21.16/cursor-gateway/stable"
        );
    }

    #[test]
    fn feed_url_rejects_untrusted_host() {
        assert!(feed_url("https://evil.example/updates", "darwin", "cursor", "3.21.16").is_none());
        assert!(feed_url("http://api2.cursor.sh/updates", "darwin", "cursor", "3.21.16").is_none());
    }

    #[test]
    fn app_slug_lowercases_name_short() {
        assert_eq!(app_slug("Cursor"), "cursor");
        assert_eq!(app_slug("Cursor Dev"), "cursor-dev");
    }

    #[test]
    fn newer_version_offers_the_download() {
        let offer = parse_feed(
            200,
            r#"{"url":"https://downloads.cursor.com/production/abc/darwin/arm64/Cursor-darwin-arm64.zip","name":"3.24.18"}"#,
            "3.21.16",
        );
        assert!(offer.available);
        assert_eq!(offer.latest.as_deref(), Some("3.24.18"));
        assert_eq!(offer.current.as_deref(), Some("3.21.16"));
        assert!(offer.url.unwrap().starts_with("https://downloads.cursor.com/"));
    }

    #[test]
    fn windows_feed_uses_product_version() {
        let offer = parse_feed(
            200,
            r#"{"version":"3.24.18","productVersion":"3.24.18","url":"https://downloads.cursor.com/CursorSetup-x64-3.24.18.exe"}"#,
            "3.21.16",
        );
        assert_eq!(offer.latest.as_deref(), Some("3.24.18"));
    }

    #[test]
    fn no_content_means_up_to_date() {
        let offer = parse_feed(204, "", "3.24.18");
        assert!(!offer.available);
        assert_eq!(offer.current.as_deref(), Some("3.24.18"));
        assert!(offer.latest.is_none());
    }

    #[test]
    fn same_or_older_version_hides_the_button() {
        assert!(!parse_feed(
            200,
            r#"{"name":"3.21.16","url":"https://downloads.cursor.com/a.zip"}"#,
            "3.21.16"
        )
        .available);
        assert!(!parse_feed(
            200,
            r#"{"name":"3.0.0","url":"https://downloads.cursor.com/a.zip"}"#,
            "3.21.16"
        )
        .available);
    }

    #[test]
    fn untrusted_download_falls_back_to_the_download_page() {
        let offer = parse_feed(
            200,
            r#"{"name":"3.24.18","url":"https://evil.example/Cursor.zip"}"#,
            "3.21.16",
        );
        assert_eq!(offer.url.as_deref(), Some(DOWNLOAD_PAGE));
    }

    #[test]
    fn installer_filename_uses_the_zip_name() {
        let name = installer_filename(
            "https://downloads.cursor.com/production/abc/darwin/arm64/Cursor-darwin-arm64.zip?unused=1",
        )
        .unwrap();
        assert_eq!(name, "Cursor-darwin-arm64.zip");
    }

    #[test]
    fn download_page_is_not_an_installer() {
        let error = installer_filename(DOWNLOAD_PAGE).unwrap_err();
        assert!(error.to_string().contains("direct installer"));
    }

    #[test]
    fn duplicate_installer_gets_a_numbered_name() {
        let dir = std::env::temp_dir().join(format!("ccm-name-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("Cursor-darwin-arm64.zip"), b"old").unwrap();
        let path = unique_download_path(&dir, "Cursor-darwin-arm64.zip").unwrap();
        assert_eq!(path.file_name().unwrap(), "Cursor-darwin-arm64 1.zip");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn fetch_writes_the_installer_and_skips_html() {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let port = match server.server_addr() {
            tiny_http::ListenAddr::IP(addr) => addr.port(),
            other => panic!("expected an ip listen address, got {other:?}"),
        };
        let dir = std::env::temp_dir().join(format!("ccm-fetch-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::thread::spawn(move || {
            for _ in 0..2 {
                let request = server.recv().unwrap();
                let path = request.url().to_string();
                if path.contains("page") {
                    let response = tiny_http::Response::from_string("<html></html>").with_header(
                        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..])
                            .unwrap(),
                    );
                    request.respond(response).unwrap();
                } else {
                    let response = tiny_http::Response::from_data(b"zip-bytes".as_slice());
                    request.respond(response).unwrap();
                }
            }
        });
        let saved = fetch_to_file(
            &format!("http://127.0.0.1:{port}/Cursor-darwin-arm64.zip"),
            &dir,
            "Cursor-darwin-arm64.zip",
            &mut |_, _| {},
        )
        .unwrap();
        assert_eq!(std::fs::read(&saved).unwrap(), b"zip-bytes");
        assert!(saved.extension().unwrap() == "zip");
        let html = fetch_to_file(
            &format!("http://127.0.0.1:{port}/page"),
            &dir,
            "Cursor-darwin-arm64.zip",
            &mut |_, _| {},
        );
        assert!(html.is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn version_compare_is_numeric() {
        assert!(version_is_newer("3.24.18", "3.21.16"));
        assert!(version_is_newer("3.10.0", "3.9.9"));
        assert!(!version_is_newer("3.21.16", "3.21.16"));
        assert!(!version_is_newer("3.21.16", "3.24.18"));
    }
}
