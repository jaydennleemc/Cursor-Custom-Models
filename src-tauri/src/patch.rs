use crate::checksum;
use crate::cursor::CursorInstall;
use crate::error::{AppError, Result};
use regex::Regex;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::OnceLock;
use std::time::Instant;

pub const MARKER: &str = "__CURSOR_CM__";
const PLACEHOLDER: &str = "__CM_CONFIG_PLACEHOLDER__";
const RUNTIME: &str = include_str!("../../runtime/cm-runtime.js");
const MIN_BAK_BYTES: u64 = 1_000_000;
/// Start of the appended runtime. Used to refresh config without rewriting
/// the whole workbench bundle (tens of MB).
const INJECT_HEAD: &[u8] = b" * Cursor Custom Models Runtime v";

const TRANSPORT_RE: &str = r#"async transport\(\)\{try\{return await ([A-Za-z_$][\w$]*)\(this\._provider,AbortSignal\.timeout\(([A-Za-z_$][\w$]*)\)\)\}catch\{throw new Error\("No Connect transport provider registered\."\)\}\}"#;
const EXT_RE: &str = r#"registerConnectTransportProvider\(([A-Za-z_$][\w$]*)\)\{this\.([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*),this\._proxy\.\$registerAiConnectTransportProvider\(\)\}"#;
const ANCHOR_DESKTOP: &str = r#"async transport(){try{return await gb(this._provider,AbortSignal.timeout(D3u))}catch{throw new Error("No Connect transport provider registered.")}}"#;
const ANCHOR_DESKTOP_REP: &str = r#"async transport(){try{const __cmT=await gb(this._provider,AbortSignal.timeout(D3u));try{return(globalThis.__CURSOR_CM__&&globalThis.__CURSOR_CM__.wrap)?globalThis.__CURSOR_CM__.wrap(__cmT):__cmT}catch(__cmE){return __cmT}}catch{throw new Error("No Connect transport provider registered.")}}"#;
const EXT_TEMPLATE: &str = r#"registerConnectTransportProvider(__ARG__){this.__FIELD__=(function(t){if(!t||typeof Proxy==="undefined")return t;return new Proxy(t,{get:function(target,prop){if(prop==="unary"||prop==="stream"){return function(){var cm=globalThis.__CURSOR_CM__;if(cm&&cm.wrap){try{return cm.wrap(target)[prop].apply(target,arguments)}catch(e){}}var v=target[prop];return v.apply(target,arguments)};}var v=target[prop];return typeof v==="function"?v.bind(target):v;}});})(__ARG__),this._proxy.$registerAiConnectTransportProvider()}"#;
/// Free-plan helper that returns true only for confirmed FREE + no team.
/// Cursor then locks the composer model picker (`locked_picker`).
const CONFIRMED_FREE_RE: &str = r#"(\{membershipType:[A-Za-z_$][\w$]*,hasResolvedTeamMembership:[A-Za-z_$][\w$]*,teamId:[A-Za-z_$][\w$]*\}\)\{)return [A-Za-z_$][\w$]*===[A-Za-z_$][\w$]*\.FREE&&[A-Za-z_$][\w$]*&&[A-Za-z_$][\w$]*===void 0\}"#;
/// Full-picker gate: false while a free user is still "potentially locked".
const PICKER_ALLOW_RE: &str = r#"(\{isAuthSettling:[A-Za-z_$][\w$]*,isPotentiallyFreeUserModelPickerLocked:[A-Za-z_$][\w$]*,isFreeUserMembershipConfirmedToAllowFullPicker:[A-Za-z_$][\w$]*,isRestrictedModelPicker:[A-Za-z_$][\w$]*\}\)\{)return![A-Za-z_$][\w$]*&&![A-Za-z_$][\w$]*&&\(![A-Za-z_$][\w$]*\|\|[A-Za-z_$][\w$]*\)\}"#;
/// Policy mapper: eligible free users get `{kind:"locked"}` instead of the list.
const LOCKED_PICKER_KIND_RE: &str = r#"[A-Za-z_$][\w$]*==="locked_picker"\{kind:"locked",onUpgradeClick:[A-Za-z_$][\w$]*\}:[A-Za-z_$][\w$]*==="grayed_models"\{kind:"models-disabled",onUpgradeClick:[A-Za-z_$][\w$]*\}:\{kind:"full"\}"#;

fn patched_cache() -> &'static Mutex<HashMap<PathBuf, (bool, Instant)>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, (bool, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

const CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(2);

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
    file_contains(path, b"async transport(") || file_contains(path, b"registerConnectTransportProvider")
}

fn file_contains(path: &Path, needle: &[u8]) -> bool {
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    if needle.is_empty() {
        return true;
    }
    let mut buf = vec![0u8; 1024 * 1024];
    let mut overlap: Vec<u8> = Vec::new();
    loop {
        let Ok(n) = file.read(&mut buf) else {
            return false;
        };
        if n == 0 {
            return false;
        }
        if !overlap.is_empty() {
            overlap.extend_from_slice(&buf[..n]);
            if memmem(&overlap, needle) {
                return true;
            }
        }
        if memmem(&buf[..n], needle) {
            return true;
        }
        let keep = needle.len().saturating_sub(1).min(n);
        overlap.clear();
        overlap.extend_from_slice(&buf[n - keep..n]);
    }
}

fn memmem(hay: &[u8], needle: &[u8]) -> bool {
    hay.windows(needle.len()).any(|w| w == needle)
}

/// Check whether a file has been patched. Uses an in-memory cache (2s TTL)
/// so repeated UI status polls do not re-read the tail of large workbench files.
pub fn file_is_patched(path: &Path) -> bool {
    // Check cache first
    if let Ok(cache) = patched_cache().lock() {
        if let Some((patched, at)) = cache.get(path) {
            if at.elapsed() < CACHE_TTL {
                return *patched;
            }
        }
    }

    let patched = file_is_patched_uncached(path);

    // Store in cache
    if let Ok(mut cache) = patched_cache().lock() {
        cache.insert(path.to_path_buf(), (patched, Instant::now()));
    }
    patched
}

fn file_is_patched_uncached(path: &Path) -> bool {
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

/// Invalidate the patched cache for a specific path (after write/modify).
pub fn invalidate_patched_cache(path: &Path) {
    if let Ok(mut cache) = patched_cache().lock() {
        cache.remove(path);
    }
}

pub fn inject_runtime(config_json: &str) -> Result<String> {
    if !RUNTIME.contains(PLACEHOLDER) {
        return Err(AppError::msg("cm-runtime.js is missing __CM_CONFIG_PLACEHOLDER__"));
    }
    Ok(RUNTIME.replace(PLACEHOLDER, config_json.trim()))
}

pub struct AnchorResult {
    pub patched: bool,
    #[allow(dead_code)]
    pub detail: String,
    pub content: String,
}

fn ext_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(EXT_RE).expect("ext regex"))
}

fn transport_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(TRANSPORT_RE).expect("transport regex"))
}

fn confirmed_free_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(CONFIRMED_FREE_RE).expect("confirmed-free regex"))
}

fn picker_allow_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(PICKER_ALLOW_RE).expect("picker-allow regex"))
}

fn locked_picker_kind_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(LOCKED_PICKER_KIND_RE).expect("locked-picker regex"))
}

/// Disable Cursor's free-plan model-picker lock (stable property names, minified locals).
fn unlock_model_picker(content: &str) -> (String, bool) {
    let mut text = content.to_string();
    let mut changed = false;

    let next = confirmed_free_re().replace_all(&text, |caps: &regex::Captures| {
        format!("{}return!1}}", &caps[1])
    });
    if next.as_ref() != text.as_str() {
        text = next.into_owned();
        changed = true;
    }

    let next = picker_allow_re().replace_all(&text, |caps: &regex::Captures| {
        format!("{}return!0}}", &caps[1])
    });
    if next.as_ref() != text.as_str() {
        text = next.into_owned();
        changed = true;
    }

    let next = locked_picker_kind_re().replace_all(&text, r#"{kind:"full"}"#);
    if next.as_ref() != text.as_str() {
        text = next.into_owned();
        changed = true;
    }

    (text, changed)
}

pub fn apply_anchors(content: &str) -> AnchorResult {
    let mut text = content.to_string();
    let mut detail = String::new();
    let mut patched = false;

    let ext_out = ext_re().replace_all(&text, |caps: &regex::Captures| {
        if &caps[1] != &caps[3] {
            return caps.get(0).map(|m| m.as_str().to_string()).unwrap_or_default();
        }
        EXT_TEMPLATE
            .replace("__ARG__", &caps[1])
            .replace("__FIELD__", &caps[2])
    });
    if ext_out.as_ref() != text.as_str() {
        text = ext_out.into_owned();
        patched = true;
        detail.push_str("ext-provider; ");
    }

    let t_out = transport_re().replace_all(&text, |caps: &regex::Captures| {
        format!(
            "async transport(){{try{{const __cmT=await {}(this._provider,AbortSignal.timeout({}));try{{return(globalThis.__CURSOR_CM__&&globalThis.__CURSOR_CM__.wrap)?globalThis.__CURSOR_CM__.wrap(__cmT):__cmT}}catch(__cmE){{return __cmT}}}}catch{{throw new Error(\"No Connect transport provider registered.\")}}}}",
            &caps[1],
            &caps[2]
        )
    });
    if t_out.as_ref() != text.as_str() {
        text = t_out.into_owned();
        patched = true;
        detail.push_str("transport; ");
    } else if text.contains(ANCHOR_DESKTOP) {
        text = text.replace(ANCHOR_DESKTOP, ANCHOR_DESKTOP_REP);
        patched = true;
        detail.push_str("desktop-exact; ");
    }

    let (unlocked, picker) = unlock_model_picker(&text);
    if picker {
        text = unlocked;
        patched = true;
        detail.push_str("model-picker; ");
    }

    AnchorResult {
        patched,
        detail,
        content: text,
    }
}

pub fn patch_install(install: &CursorInstall, injected_json: &str, log: &mut Vec<String>) -> Result<()> {
    let runtime = inject_runtime(injected_json)?;
    if !runtime.contains(MARKER) {
        return Err(AppError::msg("Runtime inject failed: marker missing"));
    }

    let mut any_ok = false;
    for target in &install.targets {
        let leaf = file_leaf(target);
        match patch_one(target, &runtime) {
            Ok(()) => {
                any_ok = true;
                log.push(format!("{leaf}  patched"));
            }
            Err(e) => log.push(format!("{leaf}  failed — {e}")),
        }
    }
    if !any_ok {
        return Err(AppError::msg("No files were patched"));
    }
    match checksum::update_product_json(&install.product_json, &install.out_dir, &install.targets) {
        Ok(true) => log.push("product.json  checksums updated".into()),
        Ok(false) => log.push("product.json  unchanged".into()),
        Err(e) => log.push(format!("product.json  failed — {e}")),
    }
    Ok(())
}

fn file_leaf(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string())
}

fn patch_one(target: &Path, runtime: &str) -> Result<()> {
    if file_is_patched(target) {
        let content = fs::read_to_string(target)?;
        let (next, unlocked) = unlock_model_picker(&content);
        if unlocked {
            fs::write(target, next)?;
        }
        if replace_runtime_tail(target, runtime)? {
            return Ok(());
        }
    }

    let bak = bak_path(target);
    let mut content = fs::read_to_string(target)?;
    if content.contains(MARKER) {
        if !bak_intact(&bak) {
            return Err(AppError::msg(format!(
                "already patched but backup is invalid: {}",
                bak.display()
            )));
        }
        fs::copy(&bak, target)?;
        content = fs::read_to_string(target)?;
        if content.len() < MIN_BAK_BYTES as usize {
            return Err(AppError::msg("file is invalid after restore from backup"));
        }
    }

    let applied = apply_anchors(&content);
    if !applied.patched {
        return Err(AppError::msg("anchor not found; file unchanged"));
    }

    if !content.contains(MARKER) {
        fs::write(&bak, &content)?;
    }

    fs::write(target, format!("{}\n{runtime}\n", applied.content))?;
    // Invalidate cache after writing
    invalidate_patched_cache(target);
    Ok(())
}

fn replace_runtime_tail(path: &Path, runtime: &str) -> Result<bool> {
    let mut file = fs::OpenOptions::new().read(true).write(true).open(path)?;
    let len = file.metadata()?.len();
    if len < INJECT_HEAD.len() as u64 {
        return Ok(false);
    }
    let window = (512 * 1024).min(len);
    file.seek(SeekFrom::End(-(window as i64)))?;
    let mut buf = vec![0u8; window as usize];
    file.read_exact(&mut buf)?;
    let Some(hit) = buf.windows(INJECT_HEAD.len()).position(|w| w == INJECT_HEAD) else {
        return Ok(false);
    };
    // Walk back over the banner line and the `/* ===` line, plus the separator newline.
    let mut rel = hit;
    let mut lines = 0u8;
    while rel > 0 {
        rel -= 1;
        if buf[rel] == b'\n' {
            lines += 1;
            if lines == 2 {
                break;
            }
        }
    }
    if buf.get(rel) == Some(&b'\n') {
        rel += 1;
    }
    while rel > 0 && (buf[rel - 1] == b'\n' || buf[rel - 1] == b'\r') {
        rel -= 1;
    }
    let keep = len - window + rel as u64;
    file.set_len(keep)?;
    file.seek(SeekFrom::Start(keep))?;
    file.write_all(b"\n")?;
    file.write_all(runtime.as_bytes())?;
    file.write_all(b"\n")?;
    invalidate_patched_cache(path);
    Ok(true)
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

    #[test]
    fn free_plan_model_picker_is_unlocked() {
        let src = concat!(
            r#"function dVv({membershipType:e,hasResolvedTeamMembership:t,teamId:n}){return e===yr.FREE&&t&&n===void 0}"#,
            r#"function pVv({isAuthSettling:e,isPotentiallyFreeUserModelPickerLocked:t,isFreeUserMembershipConfirmedToAllowFullPicker:n,isRestrictedModelPicker:i}){return!e&&!i&&(!t||n)}"#,
            r#"function JGv({allocation:e,eligible:t,onUpgradeClick:n}){return t?e==="locked_picker"?{kind:"locked",onUpgradeClick:n}:e==="grayed_models"?{kind:"models-disabled",onUpgradeClick:n}:{kind:"full"}:{kind:"full"}}"#,
        );
        let out = apply_anchors(src);
        assert!(out.patched);
        assert!(out.detail.contains("model-picker"));
        assert!(out.content.contains("teamId:n}){return!1}"));
        assert!(out.content.contains("isRestrictedModelPicker:i}){return!0}"));
        assert!(out.content.contains(r#"{return t?{kind:"full"}:{kind:"full"}}"#));
        assert!(!out.content.contains("locked_picker"));
        assert!(!out.content.contains("yr.FREE&&t&&n===void 0"));
        // Second apply is a no-op (idempotent).
        let again = apply_anchors(&out.content);
        assert!(!again.patched);
        assert_eq!(again.content, out.content);
    }

    #[test]
    fn free_plan_model_picker_accepts_glass_minified_names() {
        let src = concat!(
            r#"function x({membershipType:t,hasResolvedTeamMembership:e,teamId:n}){return t===ds.FREE&&e&&n===void 0}"#,
            r#"{isAuthSettling:t,isPotentiallyFreeUserModelPickerLocked:e,isFreeUserMembershipConfirmedToAllowFullPicker:n,isRestrictedModelPicker:i}){return!t&&!i&&(!e||n)}"#,
            r#"t==="locked_picker"?{kind:"locked",onUpgradeClick:n}:t==="grayed_models"?{kind:"models-disabled",onUpgradeClick:n}:{kind:"full"}"#,
        );
        let out = apply_anchors(src);
        assert!(out.patched);
        assert!(out.content.contains("teamId:n}){return!1}"));
        assert!(out.content.contains("isRestrictedModelPicker:i}){return!0}"));
        assert!(out.content.contains(r#"{kind:"full"}"#));
        assert!(!out.content.contains("locked_picker"));
    }

    #[test]
    fn bak_intact_finds_anchor_past_first_256kb() {
        let dir = std::env::temp_dir().join(format!("ccm-bak-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("workbench.js.cm-bak");
        let mut body = vec![b'x'; 400_000];
        body.extend_from_slice(b"async transport(){return 1}");
        body.extend_from_slice(&vec![b'y'; 700_000]);
        fs::write(&path, &body).unwrap();
        assert!(bak_intact(&path));
        fs::write(&path, vec![b'z'; 1_200_000]).unwrap();
        assert!(!bak_intact(&path));
        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir(&dir);
    }

    #[test]
    fn replace_runtime_tail_updates_config_without_full_rewrite() {
        let dir = std::env::temp_dir().join(format!("ccm-rt-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("workbench.js");
        let original = "async transport(){return 1}\n";
        let runtime_a = inject_runtime(r#"{"enabled":true,"tag":"a"}"#).unwrap();
        let runtime_b = inject_runtime(r#"{"enabled":true,"tag":"b"}"#).unwrap();
        fs::write(&path, format!("{original}\n{runtime_a}\n")).unwrap();
        assert!(file_is_patched(&path));
        assert!(replace_runtime_tail(&path, &runtime_b).unwrap());
        let out = fs::read_to_string(&path).unwrap();
        assert!(out.starts_with("async transport(){return 1}"));
        assert!(out.contains(r#""tag":"b""#));
        assert!(!out.contains(r#""tag":"a""#));
        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir(&dir);
    }
}