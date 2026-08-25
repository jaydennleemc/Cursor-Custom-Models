use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentContext {
    #[serde(default = "default_true")]
    pub env: bool,
    #[serde(default = "default_true")]
    pub rules: bool,
    #[serde(default = "default_true")]
    pub repo: bool,
    #[serde(default = "default_true")]
    pub layout: bool,
    #[serde(default = "default_layout_depth")]
    pub layout_max_depth: u32,
    #[serde(default = "default_layout_lines")]
    pub layout_max_lines: u32,
    #[serde(default = "default_true")]
    pub mcp: bool,
    #[serde(default)]
    pub mcp_tool_schemas: bool,
}

impl Default for AgentContext {
    fn default() -> Self {
        Self {
            env: true,
            rules: true,
            repo: true,
            layout: true,
            layout_max_depth: default_layout_depth(),
            layout_max_lines: default_layout_lines(),
            mcp: true,
            mcp_tool_schemas: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_base_url")]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_model")]
    pub default_model: String,
    #[serde(default = "default_mapping")]
    pub model_mapping: HashMap<String, String>,
    #[serde(default = "default_intercept")]
    pub intercept_methods: Vec<String>,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub extra_headers: HashMap<String, String>,
    #[serde(default)]
    pub send_reasoning_as_text: bool,
    #[serde(default = "default_true")]
    pub block_usage_gate: bool,
    #[serde(default = "default_true")]
    pub agent_tools: bool,
    #[serde(default)]
    pub agent_system_prompt: String,
    #[serde(default = "default_timeout")]
    pub agent_tool_timeout_ms: u32,
    #[serde(default = "default_rounds")]
    pub agent_max_tool_rounds: u32,
    #[serde(default)]
    pub agent_context: AgentContext,
    #[serde(default)]
    pub debug_dump: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            base_url: default_base_url(),
            api_key: String::new(),
            default_model: default_model(),
            model_mapping: default_mapping(),
            intercept_methods: default_intercept(),
            temperature: None,
            max_tokens: None,
            extra_headers: HashMap::new(),
            send_reasoning_as_text: false,
            block_usage_gate: true,
            agent_tools: true,
            agent_system_prompt: String::new(),
            agent_tool_timeout_ms: default_timeout(),
            agent_max_tool_rounds: default_rounds(),
            agent_context: AgentContext::default(),
            debug_dump: false,
        }
    }
}

impl AppConfig {
    pub fn looks_unconfigured(&self) -> bool {
        if !self.enabled {
            return true;
        }
        if self.base_url.trim().is_empty() {
            return true;
        }
        if self.api_key.trim().is_empty() {
            return true;
        }
        self.api_key.to_ascii_lowercase().contains("your-")
    }

    pub fn to_inject_json(&self) -> Result<String> {
        Ok(serde_json::to_string(self)?)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProxySettings {
    #[serde(default = "default_proxy_upstream")]
    pub upstream: String,
    #[serde(default = "default_proxy_port")]
    pub port: u16,
}

impl Default for ProxySettings {
    fn default() -> Self {
        Self {
            upstream: default_proxy_upstream(),
            port: default_proxy_port(),
        }
    }
}

fn default_true() -> bool {
    true
}
fn default_base_url() -> String {
    "http://127.0.0.1:6446/v1".into()
}
fn default_model() -> String {
    "hy3-free".into()
}
fn default_layout_depth() -> u32 {
    4
}
fn default_layout_lines() -> u32 {
    160
}
fn default_timeout() -> u32 {
    30_000
}
fn default_rounds() -> u32 {
    8
}
fn default_proxy_upstream() -> String {
    "https://open.bigmodel.cn".into()
}
fn default_proxy_port() -> u16 {
    8117
}
fn default_mapping() -> HashMap<String, String> {
    let mut map = HashMap::new();
    map.insert("*".into(), default_model());
    map
}
pub fn default_intercept() -> Vec<String> {
    vec![
        "aiserver.v1.ChatService/StreamUnifiedChat".into(),
        "aiserver.v1.ChatService/StreamUnifiedChatWithTools".into(),
        "aiserver.v1.ChatService/StreamUnifiedChatWithToolsIdempotent".into(),
        "aiserver.v1.CmdKService/StreamCmdK".into(),
        "agent.v1.AgentService/Run".into(),
    ]
}

pub fn config_dir_path() -> Result<PathBuf> {
    let base = dirs::config_dir().ok_or_else(|| AppError::msg("Could not resolve the system config directory"))?;
    Ok(base.join("cursor-custom-model"))
}

pub fn config_file_path() -> Result<PathBuf> {
    Ok(config_dir_path()?.join("config.json"))
}

pub fn proxy_file_path() -> Result<PathBuf> {
    Ok(config_dir_path()?.join("proxy.json"))
}

pub fn load_config() -> Result<AppConfig> {
    load_or_default(&config_file_path()?)
}

pub fn save_config(config: &AppConfig) -> Result<PathBuf> {
    let path = config_file_path()?;
    write_json(&path, config)?;
    Ok(path)
}

pub fn load_proxy() -> Result<ProxySettings> {
    load_or_default(&proxy_file_path()?)
}

pub fn save_proxy(settings: &ProxySettings) -> Result<PathBuf> {
    let path = proxy_file_path()?;
    write_json(&path, settings)?;
    Ok(path)
}

fn load_or_default<T: Default + for<'de> Deserialize<'de>>(path: &Path) -> Result<T> {
    if !path.exists() {
        return Ok(T::default());
    }
    let text = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&text)?)
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let text = serde_json::to_string_pretty(value)?;
    fs::write(path, text)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_roundtrip() {
        let cfg = AppConfig::default();
        let json = serde_json::to_string(&cfg).unwrap();
        let back: AppConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(cfg, back);
        assert!(json.contains("baseUrl"));
        assert!(json.contains("interceptMethods"));
    }

    #[test]
    fn placeholder_key_is_unconfigured() {
        let mut cfg = AppConfig::default();
        cfg.api_key = "sk-YOUR-API-KEY-HERE".into();
        assert!(cfg.looks_unconfigured());
        cfg.api_key = "sk-real-key".into();
        assert!(!cfg.looks_unconfigured());
    }
}
