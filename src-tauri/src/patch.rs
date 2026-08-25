use crate::checksum;
use crate::config::AppConfig;
use crate::cursor::CursorInstall;
use crate::error::{AppError, Result};
use regex::Regex;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const MARKER: &str = "__CURSOR_CM__";
const PLACEHOLDER: &str = "__CM_CONFIG_PLACEHOLDER__";
const RUNTIME: &str = include_str!("../../runtime/cm-runtime.js");
const MIN_BAK_BYTES: u64 = 1_000_000;

const TRANSPORT_RE: &str = r#"async transport\(\)\{try\{return await ([A-Za-z_$][\w$]*)\(this\._provider,AbortSignal\.timeout\(([A-Za-z_$][\w$]*)\)\)\}catch\{throw new Error\("No Connect transport provider registered\."\)\}\}"#;
const EXT_RE: &str = r#"registerConnectTransportProvider\(([A-Za-z_$][\w$]*)\)\{this\.([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*),this\._proxy\.\$registerAiConnectTransportProvider\(\)\}"#;
const ANCHOR_DESKTOP: &str = r#"async transport(){try{return await gb(this._provider,AbortSignal.timeout(D3u))}catch{throw new Error("No Connect transport provider registered.")}}"#;
const ANCHOR_DESKTOP_REP: &str = r#"async transport(){try{const __cmT=await gb(this._provider,AbortSignal.timeout(D3u));try{return(globalThis.__CURSOR_CM__&&globalThis.__CURSOR_CM__.wrap)?globalThis.__CURSOR_CM__.wrap(__cmT):__cmT}catch(__cmE){return __cmT}}catch{throw new Error("No Connect transport provider registered.")}}"#;
const EXT_TEMPLATE: &str = r#"registerConnectTransportProvider(__ARG__){this.__FIELD__=(function(t){if(!t||typeof Proxy==="undefined")return t;return new Proxy(t,{get:function(target,prop){if(prop==="unary"||prop==="stream"){return function(){var cm=globalThis.__CURSOR_CM__;if(cm&&cm.wrap){try{return cm.wrap(target)[prop].apply(target,arguments)}catch(e){}}var v=target[prop];return v.apply(target,arguments)};}var v=target[prop];return typeof v==="function"?v.bind(target):v;}});})(__ARG__),this._proxy.$registerAiConnectTransportProvider()}"#;

pub fn bak_path(target: &Path) -> PathBuf {
    let mut s = target.as_os_str().to_os_string();
    s.push(".cm-bak");
    PathBuf::from(s)
}

pub fn bak_intact(path: &Path) -> bool {
    let Ok(meta) = fs::metadata(path) else {
        return false;
    };
    if meta.len() < MIN_BAK_BYTES {
        return false;
    }
    let Ok(text) = fs::read_to_string(path) else {
        return false;
    };
    text.contains("async transport(") || text.contains("registerConnectTransportProvider")
}

pub fn file_is_patched(path: &Path) -> bool {
    use std::io::{Read, Seek, SeekFrom};
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    let Ok(meta) = file.metadata() else {
        return false;
    };
    const TAIL: u64 = 512 * 1024;
    let start = meta.len().saturating_sub(TAIL);
    if file.seek(SeekFrom::Start(start)).is_err() {
        return false;
    }
    let mut buf = Vec::new();
    if file.read_to_end(&mut buf).is_err() {
        return false;
    }
    String::from_utf8_lossy(&buf).contains(MARKER)
}

pub fn inject_runtime(config_json: &str) -> Result<String> {
    if !RUNTIME.contains(PLACEHOLDER) {
        return Err(AppError::msg("cm-runtime.js is missing __CM_CONFIG_PLACEHOLDER__"));
    }
    Ok(RUNTIME.replace(PLACEHOLDER, config_json.trim()))
}

pub struct AnchorResult {
    pub patched: bool,
    pub detail: String,
    pub content: String,
}

pub fn apply_anchors(content: &str) -> AnchorResult {
    let mut text = content.to_string();
    let mut detail = String::new();
    let mut patched = false;

    let ext_re = Regex::new(EXT_RE).expect("ext regex");
    let ext_count = ext_re
        .captures_iter(&text)
        .filter(|caps| caps.get(1).map(|m| m.as_str()) == caps.get(3).map(|m| m.as_str()))
        .count();
    if ext_count > 0 {
        text = ext_re
            .replace_all(&text, |caps: &regex::Captures| {
                if &caps[1] != &caps[3] {
                    return caps.get(0).map(|m| m.as_str().to_string()).unwrap_or_default();
                }
                EXT_TEMPLATE
                    .replace("__ARG__", &caps[1])
                    .replace("__FIELD__", &caps[2])
            })
            .into_owned();
        patched = true;
        detail.push_str(&format!("ext-provider x{ext_count}; "));
    }

    let transport_re = Regex::new(TRANSPORT_RE).expect("transport regex");
    let t_count = transport_re.find_iter(&text).count();
    if t_count > 0 {
        text = transport_re
            .replace_all(&text, |caps: &regex::Captures| {
                format!(
                    "async transport(){{try{{const __cmT=await {}(this._provider,AbortSignal.timeout({}));try{{return(globalThis.__CURSOR_CM__&&globalThis.__CURSOR_CM__.wrap)?globalThis.__CURSOR_CM__.wrap(__cmT):__cmT}}catch(__cmE){{return __cmT}}}}catch{{throw new Error(\"No Connect transport provider registered.\")}}}}",
                    &caps[1],
                    &caps[2]
                )
            })
            .into_owned();
        patched = true;
        detail.push_str(&format!("transport x{t_count}; "));
    } else if text.contains(ANCHOR_DESKTOP) {
        text = text.replace(ANCHOR_DESKTOP, ANCHOR_DESKTOP_REP);
        patched = true;
        detail.push_str("desktop-exact x1; ");
    }

    AnchorResult {
        patched,
        detail,
        content: text,
    }
}

fn node_check(path: &Path) -> Option<bool> {
    Command::new("node")
        .arg("--check")
        .arg(path)
        .status()
        .ok()
        .map(|s| s.success())
}

pub fn patch_install(install: &CursorInstall, config: &AppConfig, log: &mut Vec<String>) -> Result<()> {
    let runtime = inject_runtime(&config.to_inject_json()?)?;
    if !runtime.contains(MARKER) {
        return Err(AppError::msg("Runtime inject failed: marker missing"));
    }

    let mut any_ok = false;
    for target in &install.targets {
        let leaf = target
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| target.display().to_string());
        log.push(format!("===== {leaf} ====="));
        match patch_one(target, &runtime, log) {
            Ok(()) => {
                any_ok = true;
                log.push(format!("{leaf} OK"));
            }
            Err(e) => log.push(format!("{leaf} FAIL: {e}")),
        }
    }
    if !any_ok {
        return Err(AppError::msg("No files were patched"));
    }
    match checksum::update_product_json(&install.product_json, &install.out_dir, &install.targets) {
        Ok(true) => log.push("Updated product.json checksums".into()),
        Ok(false) => log.push("Did not change product.json (missing file or no matches)".into()),
        Err(e) => log.push(format!("Checksum update failed: {e}")),
    }
    Ok(())
}

fn patch_one(target: &Path, runtime: &str, log: &mut Vec<String>) -> Result<()> {
    let bak = bak_path(target);
    let mut content = fs::read_to_string(target)?;
    if content.contains(MARKER) {
        if !bak_intact(&bak) {
            return Err(AppError::msg(format!(
                "Already patched but backup is invalid, skipped: {}",
                bak.display()
            )));
        }
        fs::copy(&bak, target)?;
        content = fs::read_to_string(target)?;
        if content.len() < MIN_BAK_BYTES as usize {
            return Err(AppError::msg("File is invalid after restore from backup"));
        }
        log.push("Restored from backup (idempotent)".into());
    }

    let applied = apply_anchors(&content);
    if !applied.patched {
        return Err(AppError::msg("Anchor not found; file unchanged"));
    }
    log.push(format!("Anchor replaced: {}", applied.detail));

    let patched = format!("{}\n{}\n", applied.content, runtime);

    if !content.contains(MARKER) {
        fs::write(&bak, &content)?;
        log.push("Created backup".into());
    }

    fs::write(target, &patched)?;
    log.push("Patch written".into());

    match node_check(target) {
        None => log.push("node not found, skipped syntax check".into()),
        Some(true) => log.push("Syntax check passed".into()),
        Some(false) => {
            if bak.exists() {
                fs::copy(&bak, target)?;
                log.push("Syntax check failed, rolled back".into());
                return Err(AppError::msg("Syntax check failed, rolled back"));
            }
            return Err(AppError::msg("Syntax check failed and no backup to roll back"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_has_placeholder() {
        assert!(RUNTIME.contains(PLACEHOLDER));
        assert!(RUNTIME.contains(MARKER));
    }

    #[test]
    fn inject_replaces_placeholder() {
        let out = inject_runtime(r#"{"enabled":true}"#).unwrap();
        assert!(!out.contains(PLACEHOLDER));
        assert!(out.contains(r#"{"enabled":true}"#));
    }

    #[test]
    fn transport_anchor_wraps_provider() {
        let src = r#"async transport(){try{return await gb(this._provider,AbortSignal.timeout(D3u))}catch{throw new Error("No Connect transport provider registered.")}}"#;
        let out = apply_anchors(src);
        assert!(out.patched);
        assert!(out.content.contains("__CURSOR_CM__.wrap"));
        assert!(out.content.contains("await gb("));
        assert!(out.content.contains("timeout(D3u)"));
        assert!(out.detail.contains("transport"));
    }

    #[test]
    fn transport_anchor_accepts_other_minified_names() {
        let src = r#"async transport(){try{return await xY9(this._provider,AbortSignal.timeout(Zz8))}catch{throw new Error("No Connect transport provider registered.")}}"#;
        let out = apply_anchors(src);
        assert!(out.patched);
        assert!(out.content.contains("await xY9("));
        assert!(out.content.contains("timeout(Zz8)"));
    }

    #[test]
    fn ext_provider_wraps_with_lazy_proxy() {
        let src = "registerConnectTransportProvider(n){this._provider=n,this._proxy.$registerAiConnectTransportProvider()}";
        let out = apply_anchors(src);
        assert!(out.patched);
        assert!(out.content.contains("new Proxy"));
        assert!(out.content.contains("this._provider="));
        assert!(out.detail.contains("ext-provider"));
    }

    #[test]
    fn unknown_content_is_not_patched() {
        let out = apply_anchors("hello world");
        assert!(!out.patched);
        assert_eq!(out.content, "hello world");
    }
}
