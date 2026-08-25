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
        log.push(format!("===== {leaf} ====="));
        match restore_one(target, force, log) {
            Ok(true) => any = true,
            Ok(false) => {}
            Err(e) => log.push(format!("{leaf} FAIL: {e}")),
        }
    }
    match checksum::restore_product_json(&install.product_json) {
        Ok(true) => {
            log.push("Restored product.json".into());
            any = true;
        }
        Ok(false) => log.push("No valid product.json backup, skipped".into()),
        Err(e) => log.push(format!("Failed to restore product.json: {e}")),
    }
    if !any {
        return Err(AppError::msg("Nothing to restore (Cursor may not be patched yet)"));
    }
    Ok(())
}

fn restore_one(target: &std::path::Path, force: bool, log: &mut Vec<String>) -> Result<bool> {
    let bak = bak_path(target);
    if !bak.is_file() {
        log.push("No backup, skipped".into());
        return Ok(false);
    }
    let current = fs::read_to_string(target)?;
    if !current.contains(MARKER) && !force {
        log.push("Current file has no patch marker — Cursor may have updated it. Refusing to overwrite with an old backup. Check Force restore to proceed.".into());
        return Ok(false);
    }
    if !bak_intact(&bak) {
        return Err(AppError::msg(format!(
            "Backup is incomplete, restore refused: {}",
            bak.display()
        )));
    }
    fs::copy(&bak, target)?;
    let restored = fs::read_to_string(target)?;
    if restored.len() < 1_000_000 || restored.contains(MARKER) {
        return Err(AppError::msg("Restore verification failed"));
    }
    log.push("Restored original file".into());
    Ok(true)
}
