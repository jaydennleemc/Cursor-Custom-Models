use crate::error::{AppError, Result};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::Duration;
use tiny_http::{Header, Method, Response, Server, StatusCode};

const NO_CORS_HOSTS: &[&str] = &[
    "open.bigmodel.cn",
    "api.anthropic.com",
    "generativelanguage.googleapis.com",
    "api.minimax.io",
];

/// Rewrite a base URL through the local CORS proxy when the origin cannot
/// satisfy a Chromium preflight (loopback http, or known hosts like GLM).
/// Returns `(upstream_origin, rewritten_base_url)`.
pub fn cors_proxy_rewrite(base_url: &str, proxy_port: u16) -> Option<(String, String)> {
    let parsed = reqwest::Url::parse(base_url.trim()).ok()?;
    let host = parsed.host_str()?;
    if host == "127.0.0.1" && parsed.port() == Some(proxy_port) {
        return None;
    }
    let loopback = matches!(host, "127.0.0.1" | "localhost" | "0.0.0.0" | "::1");
    if loopback && parsed.scheme() != "http" {
        return None;
    }
    if !loopback && !NO_CORS_HOSTS.contains(&host) {
        return None;
    }
    let origin_port = parsed.port().map(|p| format!(":{p}")).unwrap_or_default();
    let origin = format!("{}://{host}{origin_port}", parsed.scheme());
    let path = parsed.path().trim_end_matches('/');
    let query = parsed
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();
    let rewritten = format!("http://127.0.0.1:{proxy_port}{path}{query}");
    Some((origin, rewritten))
}

pub struct ProxyStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub upstream: Option<String>,
}

struct RunningProxy {
    stop: std::sync::Arc<AtomicBool>,
    thread: thread::JoinHandle<()>,
    port: u16,
    upstream: String,
}

static PROXY: Mutex<Option<RunningProxy>> = Mutex::new(None);

pub fn status() -> ProxyStatus {
    let guard = PROXY.lock().expect("proxy mutex");
    match guard.as_ref() {
        Some(p) => ProxyStatus {
            running: true,
            port: Some(p.port),
            upstream: Some(p.upstream.clone()),
        },
        None => ProxyStatus {
            running: false,
            port: None,
            upstream: None,
        },
    }
}

pub fn ensure_running(upstream: String, port: u16) -> Result<()> {
    let upstream = upstream.trim().trim_end_matches('/').to_string();
    {
        let guard = PROXY.lock().expect("proxy mutex");
        if let Some(running) = guard.as_ref() {
            if running.port == port && running.upstream == upstream {
                return Ok(());
            }
        }
    }
    let _ = stop();
    start(upstream, port)
}

pub fn start(upstream: String, port: u16) -> Result<()> {
    let mut guard = PROXY.lock().expect("proxy mutex");
    if guard.is_some() {
        return Err(AppError::msg("CORS proxy is already running"));
    }
    if !(1..=65535).contains(&port) {
        return Err(AppError::msg("Invalid port"));
    }
    let upstream = upstream.trim().trim_end_matches('/').to_string();
    if !(upstream.starts_with("http://") || upstream.starts_with("https://")) {
        return Err(AppError::msg("Upstream URL must start with http:// or https://"));
    }

    let stop = std::sync::Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();
    let upstream_thread = upstream.clone();
    let (tx, rx) = mpsc::channel();

    let thread = thread::spawn(move || {
        let addr = format!("127.0.0.1:{port}");
        match Server::http(&addr) {
            Ok(server) => {
                let _ = tx.send(Ok(()));
                run_loop(server, &upstream_thread, stop_thread);
            }
            Err(e) => {
                let _ = tx.send(Err(e.to_string()));
            }
        }
    });

    match rx.recv_timeout(Duration::from_secs(2)) {
        Ok(Ok(())) => {
            *guard = Some(RunningProxy {
                stop,
                thread,
                port,
                upstream,
            });
            Ok(())
        }
        Ok(Err(e)) => Err(AppError::msg(format!("Could not listen on 127.0.0.1:{port}: {e}"))),
        Err(_) => Err(AppError::msg("Proxy start timed out")),
    }
}

pub fn stop() -> Result<()> {
    let mut guard = PROXY.lock().expect("proxy mutex");
    let Some(running) = guard.take() else {
        return Err(AppError::msg("Proxy is not running"));
    };
    running.stop.store(true, Ordering::SeqCst);
    let _ = std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], running.port)),
        Duration::from_millis(300),
    );
    let _ = running.thread.join();
    Ok(())
}

fn run_loop(server: Server, upstream: &str, stop: std::sync::Arc<AtomicBool>) {
    for request in server.incoming_requests() {
        if stop.load(Ordering::SeqCst) {
            let _ = request.respond(Response::empty(503));
            break;
        }
        handle(request, upstream);
    }
}

fn cors_headers() -> Vec<Header> {
    vec![
        Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap(),
        Header::from_bytes(
            &b"Access-Control-Allow-Methods"[..],
            &b"GET, POST, OPTIONS, PUT, PATCH, DELETE"[..],
        )
        .unwrap(),
        Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"*"[..]).unwrap(),
        Header::from_bytes(&b"Access-Control-Allow-Private-Network"[..], &b"true"[..]).unwrap(),
        Header::from_bytes(&b"Access-Control-Max-Age"[..], &b"86400"[..]).unwrap(),
    ]
}

fn handle(mut request: tiny_http::Request, upstream: &str) {
    if request.method() == &Method::Options {
        let mut res = Response::empty(204);
        for h in cors_headers() {
            res = res.with_header(h);
        }
        let _ = request.respond(res);
        return;
    }

    let method = request.method().to_string();
    let url_path = request.url().to_string();
    let incoming_headers: Vec<(String, String)> = request
        .headers()
        .iter()
        .map(|h| (h.field.as_str().to_string(), h.value.as_str().to_string()))
        .collect();

    let mut body = Vec::new();
    let _ = std::io::Read::read_to_end(request.as_reader(), &mut body);

    match forward(upstream, &method, &url_path, &incoming_headers, body) {
        Ok((status, headers, resp)) => {
            let mut all_headers = headers;
            all_headers.extend(cors_headers());
            let res = Response::new(StatusCode(status), all_headers, resp, None, None);
            let _ = request.respond(res);
        }
        Err(e) => {
            let mut res = Response::from_string(format!("proxy error: {e}")).with_status_code(502);
            for h in cors_headers() {
                res = res.with_header(h);
            }
            let _ = request.respond(res);
        }
    }
}

fn forward(
    upstream: &str,
    method: &str,
    url_path: &str,
    headers: &[(String, String)],
    body: Vec<u8>,
) -> std::result::Result<(u16, Vec<Header>, reqwest::blocking::Response), String> {
    let target = format!("{upstream}{url_path}");
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(300))
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;
    let mut builder = client.request(
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?,
        &target,
    );
    for (name, value) in headers {
        let lower = name.to_ascii_lowercase();
        if matches!(
            lower.as_str(),
            "host" | "origin" | "referer" | "connection" | "content-length" | "transfer-encoding"
        ) {
            continue;
        }
        builder = builder.header(name, value);
    }
    if let Ok(url) = reqwest::Url::parse(&target) {
        if let Some(host) = url.host_str() {
            let host = if let Some(port) = url.port() {
                format!("{host}:{port}")
            } else {
                host.to_string()
            };
            builder = builder.header("host", host);
        }
    }
    if !body.is_empty() {
        builder = builder.body(body);
    }
    let resp = builder.send().map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let mut out_headers = Vec::new();
    for (name, value) in resp.headers().iter() {
        let lower = name.as_str().to_ascii_lowercase();
        if matches!(
            lower.as_str(),
            "connection" | "transfer-encoding" | "access-control-allow-origin"
        ) {
            continue;
        }
        if let Ok(h) = Header::from_bytes(name.as_str().as_bytes(), value.as_bytes()) {
            out_headers.push(h);
        }
    }
    Ok((status, out_headers, resp))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrites_loopback_v1() {
        let (origin, rewritten) =
            cors_proxy_rewrite("http://127.0.0.1:6446/v1", 8117).expect("rewrite");
        assert_eq!(origin, "http://127.0.0.1:6446");
        assert_eq!(rewritten, "http://127.0.0.1:8117/v1");
    }

    #[test]
    fn rewrites_glm_https_origin() {
        let (origin, rewritten) =
            cors_proxy_rewrite("https://open.bigmodel.cn/api/paas/v4", 8117).expect("rewrite");
        assert_eq!(origin, "https://open.bigmodel.cn");
        assert_eq!(rewritten, "http://127.0.0.1:8117/api/paas/v4");
    }

    #[test]
    fn ignores_https_and_already_proxied() {
        assert!(cors_proxy_rewrite("https://api.deepseek.com/v1", 8117).is_none());
        assert!(cors_proxy_rewrite("https://api.openai.com/v1", 8117).is_none());
        assert!(cors_proxy_rewrite("http://127.0.0.1:8117/v1", 8117).is_none());
        assert!(cors_proxy_rewrite("https://api.x.ai/v1", 8117).is_none());
        assert!(cors_proxy_rewrite("https://openrouter.ai/api/v1", 8117).is_none());
    }

    #[test]
    fn rewrites_known_no_cors_hosts() {
        let (origin, rewritten) =
            cors_proxy_rewrite("https://api.anthropic.com/v1", 8117).expect("rewrite");
        assert_eq!(origin, "https://api.anthropic.com");
        assert_eq!(rewritten, "http://127.0.0.1:8117/v1");

        let (origin, rewritten) = cors_proxy_rewrite(
            "https://generativelanguage.googleapis.com/v1beta/openai",
            8117,
        )
        .expect("rewrite");
        assert_eq!(origin, "https://generativelanguage.googleapis.com");
        assert_eq!(rewritten, "http://127.0.0.1:8117/v1beta/openai");

        let (origin, rewritten) =
            cors_proxy_rewrite("https://api.minimax.io/v1", 8117).expect("rewrite");
        assert_eq!(origin, "https://api.minimax.io");
        assert_eq!(rewritten, "http://127.0.0.1:8117/v1");
    }
}
