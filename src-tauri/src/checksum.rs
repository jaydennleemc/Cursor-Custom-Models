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
    let bak = {
        let mut p = product_json.as_os_str().to_os_string();
        p.push(".cm-bak");
        std::path::PathBuf::from(p)
    };
    if !bak.exists() {
        fs::copy(product_json, &bak)?;
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

pub fn restore_product_json(product_json: &Path) -> Result<bool> {
    let bak = {
        let mut p = product_json.as_os_str().to_os_string();
        p.push(".cm-bak");
        std::path::PathBuf::from(p)
    };
    if !bak.is_file() {
        return Ok(false);
    }
    let probe = fs::read_to_string(&bak)?;
    if serde_json::from_str::<serde_json::Value>(&probe).is_err() || !probe.contains("checksums") {
        return Ok(false);
    }
    fs::copy(&bak, product_json)?;
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
}
