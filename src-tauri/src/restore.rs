use crate::checksum;
use crate::cursor::CursorInstall;
use crate::error::{AppError, Result};
use crate::patch::{bak_intact, bak_path};
use std::fs;

pub fn restore_install(install: &CursorInstall, force: bool, log: &mut Vec<String>) -> Result<()> {
    let mut any = false;
    let mut failed = 0usize;
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
            Ok(RestoreOne::NoBackup) => {
                if crate::patch::file_is_patched(target) {
                    failed += 1;
                    log.push(format!("{leaf}  failed — no backup"));
                }
            }
            Ok(RestoreOne::NeedsForce) => {
                log.push(format!("{leaf}  skipped — enable Force restore (Cursor updated this file)"));
            }
            Err(e) => {
                failed += 1;
                log.push(format!("{leaf}  failed — {e}"));
            }
        }
    }
    match checksum::restore_product_json(&install.product_json) {
        Ok(true) => {
            log.push("product.json  restored".into());
            any = true;
        }
        Ok(false) => log.push("product.json  skipped — no backup".into()),
        Err(e) => {
            failed += 1;
            log.push(format!("product.json  failed — {e}"));
        }
    }
    let still_patched = install
        .targets
        .iter()
        .filter(|p| crate::patch::file_is_patched(p))
        .count();
    if failed > 0 || still_patched > 0 {
        return Err(AppError::msg(format!(
            "Stop did not finish ({still_patched} file(s) still patched). Enable Force restore if Cursor updated the files."
        )));
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
    let patched = crate::patch::file_is_patched(target);
    if !patched && !force {
        return Ok(RestoreOne::NeedsForce);
    }
    if !bak_intact(&bak) {
        return Err(AppError::msg(format!(
            "backup is incomplete: {}",
            bak.display()
        )));
    }
    fs::copy(&bak, target)?;
    let len = fs::metadata(target).map(|m| m.len()).unwrap_or(0);
    if len < 1_000_000 || crate::patch::file_is_patched(target) {
        return Err(AppError::msg("restore verification failed"));
    }
    Ok(RestoreOne::Done)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cursor::CursorInstall;

    fn write_patched(path: &std::path::Path) {
        let mut body = vec![b'x'; 1_100_000];
        body.extend_from_slice(b"\n__CURSOR_CM__\n");
        fs::write(path, body).unwrap();
    }

    fn write_backup(path: &std::path::Path, transport_at: usize) {
        let mut body = vec![b'y'; 1_200_000];
        let needle = b"async transport(){return 1}";
        body.splice(transport_at..transport_at, needle.iter().copied());
        fs::write(path, body).unwrap();
    }

    #[test]
    fn restore_succeeds_when_anchor_is_past_256kb() {
        let dir = std::env::temp_dir().join(format!("ccm-restore-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let target = dir.join("workbench.desktop.main.js");
        write_patched(&target);
        write_backup(&bak_path(&target), 400_000);
        let install = CursorInstall {
            root: dir.clone(),
            out_dir: dir.clone(),
            product_json: dir.join("product.json"),
            targets: vec![target.clone()],
        };
        let mut log = Vec::new();
        restore_install(&install, false, &mut log).unwrap();
        assert!(!crate::patch::file_is_patched(&target));
        assert!(log.iter().any(|l| l.contains("restored")));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn restore_fails_if_patched_file_cannot_be_restored() {
        let dir = std::env::temp_dir().join(format!("ccm-restore-fail-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let target = dir.join("workbench.desktop.main.js");
        write_patched(&target);
        let install = CursorInstall {
            root: dir.clone(),
            out_dir: dir.clone(),
            product_json: dir.join("product.json"),
            targets: vec![target.clone()],
        };
        let mut log = Vec::new();
        assert!(restore_install(&install, false, &mut log).is_err());
        assert!(crate::patch::file_is_patched(&target));
        let _ = fs::remove_dir_all(&dir);
    }
}
