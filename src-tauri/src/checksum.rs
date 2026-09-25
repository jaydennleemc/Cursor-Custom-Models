use crate::error::Result;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use regex::Regex;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

pub fn sha256_b64_nopad(bytes: &[u8]) -> String {
    let hash = Sha256::digest(bytes);
    STANDARD.encode(hash).trim_end_matches('=').to_string()
}

pub fn update_product_json(product_json: &Path, out_dir: &Path, targets: &[std::path::PathBuf]) -> Result<bool> {
    if !product_json.is_file() {
        return Ok(false);
    }
    let bak = crate::patch::bak_path(product_json);
    if !bak.exists() {
        crate::patch::ensure_bak_parent(&bak)?;
        fs::copy(product_json, &bak)?;
        crate::patch::remove_bundle_sidecar(product_json);
    }

    let mut text = fs::read_to_string(product_json)?;
    let mut changed = false;
    for target in targets {
        let rel = match target.strip_prefix(out_dir) {
            Ok(p) => p.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };
        let escaped = regex::escape(&rel);
        let pat = format!(r#""{escaped}":\s*"[^"]*""#);
        let re = Regex::new(&pat).expect("checksum path regex");
        if !re.is_match(&text) {
            continue;
        }
        let bytes = fs::read(target)?;
        let hash = sha256_b64_nopad(&bytes);
        let new_entry = format!(r#""{rel}": "{hash}""#);
        text = re.replace(&text, new_entry.as_str()).into_owned();
        changed = true;
    }
    if changed {
        fs::write(product_json, text)?;
    }
    Ok(changed)
}

/// Verify every checksum in product.json except the ones Gateway rewrites
/// (the patch targets). A mismatch among files we never touch means the
/// bundle mixes two Cursor versions — patching would mask that, so Start
/// refuses. Returns the mismatched relative paths.
pub fn verify_unpatched_checksums(
    product_json: &Path,
    out_dir: &Path,
    targets: &[std::path::PathBuf],
) -> Vec<String> {
    let Ok(text) = fs::read_to_string(product_json) else {
        return Vec::new();
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else {
        return Vec::new();
    };
    let Some(checksums) = json.get("checksums").and_then(|c| c.as_object()) else {
        return Vec::new();
    };
    let target_rels: Vec<String> = targets
        .iter()
        .filter_map(|t| t.strip_prefix(out_dir).ok())
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .collect();
    let mut mismatched = Vec::new();
    for (rel, want) in checksums {
        if target_rels.iter().any(|t| t == rel) {
            continue;
        }
        let Some(want) = want.as_str() else { continue };
        let path = out_dir.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        let Ok(bytes) = fs::read(&path) else {
            mismatched.push(rel.clone());
            continue;
        };
        if sha256_b64_nopad(&bytes) != want {
            mismatched.push(rel.clone());
        }
    }
    mismatched
}

pub fn restore_product_json(product_json: &Path) -> Result<bool> {
    let Some(bak) = crate::patch::existing_bak(product_json) else {
        return Ok(false);
    };
    let probe = fs::read_to_string(&bak)?;
    if serde_json::from_str::<serde_json::Value>(&probe).is_err() || !probe.contains("checksums") {
        return Ok(false);
    }
    fs::copy(&bak, product_json)?;
    crate::patch::remove_bundle_sidecar(product_json);
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksum_has_no_padding() {
        let hash = sha256_b64_nopad(b"abc");
        assert!(!hash.contains('='));
        assert!(!hash.is_empty());
        assert_eq!(hash, sha256_b64_nopad(b"abc"));
    }

    #[test]
    fn verify_flags_mismatched_unpatched_file() {
        let dir = std::env::temp_dir().join(format!("ccm-verify-{}", std::process::id()));
        let out = dir.join("out/vs/workbench");
        fs::create_dir_all(&out).unwrap();
        let preload = out.join("preload.js");
        fs::write(&preload, b"new-version-content").unwrap();
        let target = out.join("workbench.desktop.main.js");
        fs::write(&target, b"patched-target").unwrap();
        let product = dir.join("product.json");
        let good = sha256_b64_nopad(b"old-version-content");
        let target_hash = sha256_b64_nopad(b"anything");
        fs::write(
            &product,
            format!(
                r#"{{"checksums": {{"vs/workbench/preload.js": "{good}", "vs/workbench/workbench.desktop.main.js": "{target_hash}"}}}}"#
            ),
        )
        .unwrap();
        let mismatched = verify_unpatched_checksums(&product, &dir.join("out"), &[target.clone()]);
        assert_eq!(mismatched, vec!["vs/workbench/preload.js"]);

        // Target files are skipped: Gateway rewrites their checksums itself.
        fs::write(&product, format!(r#"{{"checksums": {{"vs/workbench/workbench.desktop.main.js": "{target_hash}"}}}}"#)).unwrap();
        assert!(verify_unpatched_checksums(&product, &dir.join("out"), &[target]).is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
