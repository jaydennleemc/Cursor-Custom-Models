use crate::checksum;
use crate::cursor::CursorInstall;
use crate::error::{AppError, Result};
use crate::patch::{bak_intact, bak_path, MARKER};
use std::fs;

pub fn restore_install(install: &CursorInstall, force: bool, log: &mut Vec<String>) -> Result<()> {
    let mut any = false;
    for target in &install.targets {
        let leaf = target
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| target.display().to_string());
        match restore_one(target, force) {
            Ok(RestoreOne::Done) => {
                any = true;
                log.push(format!("{leaf}  restored"));
            }
            Ok(RestoreOne::NoBackup) => {}
            Ok(RestoreOne::NeedsForce) => {
                log.push(format!("{leaf}  skipped — enable Force restore (Cursor updated this file)"));
            }
            Err(e) => log.push(format!("{leaf}  failed — {e}")),
        }
    }
    match checksum::restore_product_json(&install.product_json) {
        Ok(true) => {
            log.push("product.json  restored".into());
            any = true;
        }
        Ok(false) => log.push("product.json  skipped — no backup".into()),
        Err(e) => log.push(format!("product.json  failed — {e}")),
    }
    if !any {
        return Err(AppError::msg("Nothing to restore (Cursor may not be patched yet)"));
    }
    Ok(())
}

enum RestoreOne {
    Done,
    NoBackup,
    NeedsForce,
}

fn restore_one(target: &std::path::Path, force: bool) -> Result<RestoreOne> {
    let bak = bak_path(target);
    if !bak.is_file() {
        return Ok(RestoreOne::NoBackup);
    }
    let current = fs::read_to_string(target)?;
    if !current.contains(MARKER) && !force {
        return Ok(RestoreOne::NeedsForce);
    }
    if !bak_intact(&bak) {
        return Err(AppError::msg(format!(
            "backup is incomplete: {}",
            bak.display()
        )));
    }
    fs::copy(&bak, target)?;
    let restored = fs::read_to_string(target)?;
    if restored.len() < 1_000_000 || restored.contains(MARKER) {
        return Err(AppError::msg("restore verification failed"));
    }
    Ok(RestoreOne::Done)
}
