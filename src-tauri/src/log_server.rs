use crate::config;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use tiny_http::{Header, Method, Response, Server, StatusCode};

static PORT: Mutex<u16> = Mutex::new(0);
static RUNNING: AtomicBool = AtomicBool::new(false);
static PATH_OVERRIDE: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn port() -> u16 {
    *PORT.lock().expect("log port mutex")
}

#[cfg(test)]
pub fn set_log_path_override(path: PathBuf) {
    *PATH_OVERRIDE.lock().expect("log path mutex") = Some(path);
}

fn log_path() -> PathBuf {
    if let Some(path) = PATH_OVERRIDE.lock().expect("log path mutex").clone() {
        return path;
    }
    config::log_file_path().unwrap_or_default()
}

fn cors_headers() -> Vec<Header> {
    vec![
        Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
        Header::from_bytes(&b"Access-Control-Allow-Methods"[..], &b"GET, POST, OPTIONS"[..]).unwrap(),
        Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"*"[..]).unwrap(),
        Header::from_bytes(&b"Access-Control-Allow-Private-Network"[..], &b"true"[..]).unwrap(),
        Header::from_bytes(&b"Connection"[..], &b"close"[..]).unwrap(),
    ]
}

fn respond(request: tiny_http::Request, status: u16) {
    let mut res = Response::empty(StatusCode(status));
    for h in cors_headers() {
        res = res.with_header(h);
    }
    let _ = request.respond(res);
}

fn append_log(body: &str) {
    let body = body.trim();
    if body.is_empty() {
        return;
    }
    let path = log_path();
    if path.as_os_str().is_empty() {
        eprintln!("[Gateway] log path unresolved; dropping runtime log");
        return;
    }
    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            eprintln!("[Gateway] log dir create failed: {e}");
            return;
        }
    }
    match std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        Ok(mut f) => {
            if let Err(e) = writeln!(f, "{body}") {
                eprintln!("[Gateway] log write failed: {e}");
            }
        }
        Err(e) => eprintln!("[Gateway] log open failed: {e} ({})", path.display()),
    }
}

fn request_path(request: &tiny_http::Request) -> &str {
    request.url().split('?').next().unwrap_or("/")
}

fn live_config_json() -> String {
    let mut cfg = config::load_config().unwrap_or_default();
    if let Ok(px) = config::load_proxy() {
        if let Some((origin, rewritten)) = crate::proxy::cors_proxy_rewrite(&cfg.base_url, px.port) {
            let _ = crate::proxy::ensure_running(origin, px.port);
            cfg.base_url = rewritten;
        }
    }
    cfg.to_inject_json(port()).unwrap_or_else(|_| "{}".into())
}

fn respond_json(request: tiny_http::Request, body: String) {
    let mut res = Response::from_string(body).with_status_code(StatusCode(200));
    if let Ok(h) = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]) {
        res = res.with_header(h);
    }
    for h in cors_headers() {
        res = res.with_header(h);
    }
    let _ = request.respond(res);
}

fn handle(mut request: tiny_http::Request) {
    if request.method() == &Method::Options {
        respond(request, 204);
        return;
    }
    let path = request_path(&request);
    if request.method() == &Method::Get && (path == "/config" || path == "/config/") {
        respond_json(request, live_config_json());
        return;
    }
    if request.method() != &Method::Post {
        respond(request, 204);
        return;
    }
    let mut body = Vec::new();
    let _ = request.as_reader().read_to_end(&mut body);
    if let Ok(text) = std::str::from_utf8(&body) {
        append_log(text);
    }
    respond(request, 200);
}

/// Bind on this thread so `port()` is non-zero before Start can inject config.
pub fn start() {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    let server = match Server::http("127.0.0.1:0") {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[Gateway] log server bind failed: {e}");
            RUNNING.store(false, Ordering::SeqCst);
            return;
        }
    };
    let port = server
        .server_addr()
        .to_ip()
        .map(|addr| addr.port())
        .unwrap_or(0);
    *PORT.lock().expect("log port mutex") = port;
    eprintln!("[Gateway] log server listening on 127.0.0.1:{port}");
    thread::spawn(move || {
        for request in server.incoming_requests() {
            handle(request);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::net::TcpStream;
    use std::time::Duration;

    fn wait_file(path: &std::path::Path, needle: &str) -> String {
        for _ in 0..50 {
            if let Ok(text) = std::fs::read_to_string(path) {
                if text.contains(needle) {
                    return text;
                }
            }
            thread::sleep(Duration::from_millis(20));
        }
        std::fs::read_to_string(path).unwrap_or_default()
    }

    #[test]
    fn start_publishes_port_and_writes_post_body() {
        start();
        let port = port();
        assert_ne!(port, 0, "log server must publish its port before returning");

        let dir = std::env::temp_dir().join(format!("ccm-log-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("runtime.log");
        let _ = std::fs::remove_file(&path);
        set_log_path_override(path.clone());

        let body = "2026-09-08T00:00:00.000Z [CustomModels] runtime active";
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(
            stream,
            "POST /log HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        )
        .unwrap();
        stream.flush().unwrap();
        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
        let mut buf = [0u8; 256];
        let _ = stream.read(&mut buf);

        let text = wait_file(&path, "runtime active");
        let _ = std::fs::remove_file(&path);
        assert!(
            text.contains("runtime active"),
            "expected log file to contain POST body, got {text:?}"
        );

        let mut cfg_stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(
            cfg_stream,
            "GET /config HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
        )
        .unwrap();
        cfg_stream.flush().unwrap();
        let _ = cfg_stream.set_read_timeout(Some(Duration::from_secs(2)));
        let mut cfg_buf = Vec::new();
        let _ = cfg_stream.read_to_end(&mut cfg_buf);
        let cfg_raw = String::from_utf8_lossy(&cfg_buf);
        let cfg_body = cfg_raw.split("\r\n\r\n").nth(1).unwrap_or("");
        assert!(
            cfg_body.contains("\"logPort\"") && cfg_body.contains("\"baseUrl\""),
            "GET /config body: {cfg_body:?}"
        );
    }
}
