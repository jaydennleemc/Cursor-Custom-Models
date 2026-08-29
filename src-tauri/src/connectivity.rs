use crate::config::AppConfig;
use crate::error::{AppError, Result};
use serde::Serialize;
use std::time::{Duration, Instant};

#[cfg(test)]
use serde_json::Value;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTest {
    pub ok: bool,
    pub latency_ms: u64,
    pub status: u16,
    pub model: String,
    pub message: String,
}

pub fn completions_url(base_url: &str) -> Result<String> {
    let base = base_url.trim().trim_end_matches('/');
    if !(base.starts_with("http://") || base.starts_with("https://")) {
        return Err(AppError::msg("Base URL must start with http:// or https://"));
    }
    Ok(format!("{base}/chat/completions"))
}

pub fn resolve_model(config: &AppConfig) -> String {
    let asked = config.default_model.trim();
    if let Some(mapped) = config.model_mapping.get(asked) {
        if !mapped.trim().is_empty() {
            return mapped.trim().to_string();
        }
    }
    if let Some(mapped) = config.model_mapping.get("*") {
        if !mapped.trim().is_empty() {
            return mapped.trim().to_string();
        }
    }
    asked.to_string()
}

pub fn models_url(base_url: &str) -> Result<String> {
    let base = base_url.trim().trim_end_matches('/');
    if !(base.starts_with("http://") || base.starts_with("https://")) {
        return Err(AppError::msg("Base URL must start with http:// or https://"));
    }
    Ok(format!("{base}/models"))
}

pub fn test_connection(config: &AppConfig) -> Result<ConnectionTest> {
    if config.base_url.trim().is_empty() {
        return Err(AppError::msg("Enter a Base URL"));
    }
    let key = config.api_key.trim();
    if key.is_empty() || key.to_ascii_lowercase().contains("your-") {
        return Err(AppError::msg("Enter a valid API key"));
    }
    let model = resolve_model(config);
    if model.is_empty() {
        return Err(AppError::msg("Enter a default model"));
    }
    // Do not wait for a generated token, and do not download model catalogs.
    // /chat/completions headers prove URL + key + model; /models is fallback
    // only when that route is missing. OpenRouter-style /models listings can
    // take seconds before the first byte even when the body is ignored.
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(2))
        .timeout(Duration::from_secs(6))
        .pool_max_idle_per_host(0)
        .tcp_nodelay(true)
        .no_proxy()
        .build()
        .map_err(|e| AppError::msg(e.to_string()))?;

    let chat = probe_chat_head(
        &client,
        &completions_url(&config.base_url)?,
        key,
        &model,
        &config.extra_headers,
    )?;
    if chat.ok || chat.status == 0 || chat.status == 401 || chat.status == 403 {
        return Ok(chat);
    }
    if !matches!(chat.status, 404 | 405 | 501) {
        return Ok(chat);
    }
    probe_models(
        &client,
        &models_url(&config.base_url)?,
        key,
        &model,
        &config.extra_headers,
    )
}

fn apply_headers(
    mut req: reqwest::blocking::RequestBuilder,
    api_key: &str,
    extra_headers: &std::collections::HashMap<String, String>,
) -> reqwest::blocking::RequestBuilder {
    req = req.header("authorization", format!("Bearer {api_key}"));
    for (name, value) in extra_headers {
        if !name.trim().is_empty() {
            req = req.header(name, value);
        }
    }
    req
}

fn probe_models(
    client: &reqwest::blocking::Client,
    url: &str,
    api_key: &str,
    model: &str,
    extra_headers: &std::collections::HashMap<String, String>,
) -> Result<ConnectionTest> {
    let started = Instant::now();
    let sent = apply_headers(client.get(url), api_key, extra_headers)
        .header("connection", "close")
        .send();
    let latency_ms = started.elapsed().as_millis() as u64;
    let resp = match sent {
        Ok(resp) => resp,
        Err(err) => {
            return Ok(ConnectionTest {
                ok: false,
                latency_ms,
                status: 0,
                model: model.to_string(),
                message: format!("Could not connect to {url}: {err}"),
            });
        }
    };
    let status = resp.status().as_u16();
    if !(200..300).contains(&status) {
        let text = resp.text().unwrap_or_default();
        return Ok(ConnectionTest {
            ok: false,
            latency_ms,
            status,
            model: model.to_string(),
            message: format!("HTTP {status}: {}", truncate(&text, 280)),
        });
    }
    // Status is enough. Catalogs like OpenRouter /models can be megabytes.
    drop(resp);
    Ok(ConnectionTest {
        ok: true,
        latency_ms,
        status,
        model: model.to_string(),
        message: format!("Connected · {latency_ms}ms · /models available"),
    })
}

fn probe_chat_head(
    client: &reqwest::blocking::Client,
    url: &str,
    api_key: &str,
    model: &str,
    extra_headers: &std::collections::HashMap<String, String>,
) -> Result<ConnectionTest> {
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
        "stream": true
    });
    let started = Instant::now();
    let sent = apply_headers(client.post(url), api_key, extra_headers)
        .header("content-type", "application/json")
        .header("accept", "text/event-stream, application/json")
        .header("connection", "close")
        .body(body.to_string())
        .send();
    let latency_ms = started.elapsed().as_millis() as u64;
    let resp = match sent {
        Ok(resp) => resp,
        Err(err) => {
            return Ok(ConnectionTest {
                ok: false,
                latency_ms,
                status: 0,
                model: model.to_string(),
                message: format!("Could not connect to {url}: {err}"),
            });
        }
    };
    let status = resp.status().as_u16();
    if !(200..300).contains(&status) {
        let text = resp.text().unwrap_or_default();
        return Ok(ConnectionTest {
            ok: false,
            latency_ms,
            status,
            model: model.to_string(),
            message: format!("HTTP {status}: {}", truncate(&text, 280)),
        });
    }
    // Status is enough. Waiting for the first SSE token is TTFT of the model
    // (reasoning models can sit here for many seconds). Drop the body so the
    // generation is aborted instead of billed as a real completion.
    drop(resp);
    Ok(ConnectionTest {
        ok: true,
        latency_ms,
        status,
        model: model.to_string(),
        message: format!("Connected · {latency_ms}ms · {model} · /chat/completions"),
    })
}

#[cfg(test)]
fn extract_preview(body: &str) -> String {
    if let Ok(value) = serde_json::from_str::<Value>(body) {
        if let Some(content) = value
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str)
        {
            let trimmed = content.trim();
            if !trimmed.is_empty() {
                return truncate(trimmed, 80);
            }
        }
        if let Some(content) = value
            .pointer("/choices/0/delta/content")
            .and_then(Value::as_str)
        {
            let trimmed = content.trim();
            if !trimmed.is_empty() {
                return truncate(trimmed, 80);
            }
        }
        if let Some(err) = value.pointer("/error/message").and_then(Value::as_str) {
            return truncate(err.trim(), 160);
        }
    }
    let fallback = body.trim();
    if fallback.is_empty() {
        "Upstream responded with an empty body".into()
    } else {
        truncate(fallback, 80)
    }
}

#[cfg(test)]
fn extract_sse_preview(body: &str) -> String {
    for line in body.lines() {
        let line = line.trim();
        if !line.starts_with("data:") {
            continue;
        }
        let payload = line[5..].trim();
        if payload.is_empty() || payload == "[DONE]" {
            continue;
        }
        let preview = extract_preview(payload);
        if preview != "Upstream responded with an empty body" {
            return preview;
        }
    }
    extract_preview(body)
}

fn truncate(text: &str, max_chars: usize) -> String {
    let count = text.chars().count();
    if count <= max_chars {
        return text.to_string();
    }
    let mut out: String = text.chars().take(max_chars).collect();
    out.push('…');
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AppConfig;
    use std::thread;
    use tiny_http::{Response, Server, StatusCode};

    #[test]
    fn completions_url_joins_v1() {
        assert_eq!(
            completions_url("http://127.0.0.1:6446/v1/").unwrap(),
            "http://127.0.0.1:6446/v1/chat/completions"
        );
        assert!(completions_url("not-a-url").is_err());
    }

    #[test]
    fn resolve_model_uses_star_mapping() {
        let mut cfg = AppConfig::default();
        cfg.default_model = "composer".into();
        cfg.model_mapping.insert("*".into(), "hy3-free".into());
        assert_eq!(resolve_model(&cfg), "hy3-free");
        cfg.model_mapping
            .insert("composer".into(), "hy3-pro".into());
        assert_eq!(resolve_model(&cfg), "hy3-pro");
    }

    #[test]
    fn mock_models_succeeds() {
        let server = Server::http("127.0.0.1:0").unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        thread::spawn(move || {
            if let Some(request) = server.incoming_requests().next() {
                let body = r#"{"data":[{"id":"hy3-free"}]}"#;
                let _ = request.respond(Response::from_string(body).with_status_code(StatusCode(200)));
            }
        });
        let mut cfg = AppConfig::default();
        cfg.base_url = format!("http://127.0.0.1:{port}/v1");
        cfg.api_key = "sk-test".into();
        cfg.default_model = "hy3-free".into();
        let result = test_connection(&cfg).unwrap();
        assert!(result.ok, "{}", result.message);
        assert_eq!(result.status, 200);
        assert!(result.message.contains("Connected"));
    }

    #[test]
    fn chat_ok_does_not_wait_for_first_token() {
        use std::io::{Read, Write};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        thread::spawn(move || {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };
            let mut buf = [0u8; 4096];
            let _ = stream.read(&mut buf);
            let hdr = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n";
            let _ = stream.write_all(hdr.as_bytes());
            let _ = stream.flush();
            thread::sleep(Duration::from_secs(5));
            let _ = stream.write_all(b"data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n");
        });
        let mut cfg = AppConfig::default();
        cfg.base_url = format!("http://127.0.0.1:{port}/v1");
        cfg.api_key = "sk-test".into();
        cfg.default_model = "hy3-free".into();
        let started = Instant::now();
        let result = test_connection(&cfg).unwrap();
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "connection test waited for first token {:?}",
            started.elapsed()
        );
        assert!(result.ok, "{}", result.message);
        assert_eq!(result.status, 200);
        assert!(result.message.contains("/chat/completions"), "{}", result.message);
    }

    #[test]
    fn chat_404_falls_back_to_models() {
        let server = Server::http("127.0.0.1:0").unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        thread::spawn(move || {
            for request in server.incoming_requests().take(2) {
                let url = request.url().to_string();
                if url.contains("/models") {
                    let _ = request.respond(
                        Response::from_string(r#"{"data":[{"id":"hy3-free"}]}"#)
                            .with_status_code(StatusCode(200)),
                    );
                } else {
                    let _ = request.respond(
                        Response::from_string(r#"{"error":"no chat"}"#)
                            .with_status_code(StatusCode(404)),
                    );
                }
            }
        });
        let mut cfg = AppConfig::default();
        cfg.base_url = format!("http://127.0.0.1:{port}/v1");
        cfg.api_key = "sk-test".into();
        cfg.default_model = "hy3-free".into();
        let result = test_connection(&cfg).unwrap();
        assert!(result.ok, "{}", result.message);
        assert_eq!(result.status, 200);
        assert!(result.message.contains("/models"), "{}", result.message);
    }

    #[test]
    fn models_ok_does_not_wait_for_full_body() {
        use std::io::{Read, Write};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        thread::spawn(move || {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };
            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf);
            let body_len = 2_000_000usize;
            let hdr = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {body_len}\r\nConnection: close\r\n\r\n"
            );
            let _ = stream.write_all(hdr.as_bytes());
            let _ = stream.write_all(&[b'x'; 64]);
            thread::sleep(Duration::from_secs(5));
            let _ = stream.write_all(&vec![b'x'; body_len - 64]);
        });
        let mut cfg = AppConfig::default();
        cfg.base_url = format!("http://127.0.0.1:{port}/v1");
        cfg.api_key = "sk-test".into();
        cfg.default_model = "hy3-free".into();
        let started = Instant::now();
        let result = test_connection(&cfg).unwrap();
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "connection test waited {:?}",
            started.elapsed()
        );
        assert!(result.ok, "{}", result.message);
        assert_eq!(result.status, 200);
    }

    #[test]
    fn mock_unauthorized_is_not_ok() {
        let server = Server::http("127.0.0.1:0").unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        thread::spawn(move || {
            if let Some(request) = server.incoming_requests().next() {
                let _ = request.respond(
                    Response::from_string(r#"{"error":{"message":"bad key"}}"#)
                        .with_status_code(StatusCode(401)),
                );
            }
        });
        let mut cfg = AppConfig::default();
        cfg.base_url = format!("http://127.0.0.1:{port}/v1");
        cfg.api_key = "sk-test".into();
        let result = test_connection(&cfg).unwrap();
        assert!(!result.ok);
        assert_eq!(result.status, 401);
    }

    #[test]
    fn extract_preview_from_openai_json() {
        let body = r#"{"choices":[{"message":{"role":"assistant","content":"hello"}}]}"#;
        assert_eq!(extract_preview(body), "hello");
    }

    #[test]
    fn extract_preview_from_sse() {
        let body = "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\ndata: [DONE]\n";
        assert_eq!(extract_sse_preview(body), "hi");
    }

}
