use crate::error::{AppError, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};

const TARGET_RELS: &[&str] = &[
    "out/vs/workbench/workbench.desktop.main.js",
    "out/vs/workbench/workbench.glass.main.js",
    "out/vs/workbench/api/node/extensionHostProcess.js",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetStatus {
    pub name: String,
    pub path: String,
    pub exists: bool,
    pub patched: bool,
    pub backup: bool,
}

#[derive(Debug, Clone)]
pub struct CursorInstall {
    pub root: PathBuf,
    pub out_dir: PathBuf,
    pub product_json: PathBuf,
    pub targets: Vec<PathBuf>,
}

pub fn candidate_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    #[cfg(target_os = "macos")]
    {
        roots.push(PathBuf::from(
            "/Applications/Cursor.app/Contents/Resources/app",
        ));
        if let Some(home) = dirs::home_dir() {
            roots.push(home.join("Applications/Cursor.app/Contents/Resources/app"));
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            roots.push(PathBuf::from(local).join("Programs/cursor/resources/app"));
        }
        if let Ok(pf) = std::env::var("PROGRAMFILES") {
            roots.push(PathBuf::from(pf).join("Cursor/resources/app"));
        }
        if let Ok(pf86) = std::env::var("PROGRAMFILES(X86)") {
            roots.push(PathBuf::from(pf86).join("Cursor/resources/app"));
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        if let Some(home) = dirs::home_dir() {
            roots.push(home.join(".cursor/resources/app"));
        }
    }

    roots
}

pub fn discover() -> Result<CursorInstall> {
    for root in candidate_roots() {
        if let Some(install) = inspect_root(&root) {
            return Ok(install);
        }
    }
    Err(AppError::msg(
        "Cursor install not found. On macOS, confirm /Applications/Cursor.app exists. On Windows, confirm it is installed under LocalAppData\\Programs\\cursor.",
    ))
}

pub fn inspect_root(root: &Path) -> Option<CursorInstall> {
    let out_dir = root.join("out");
    if !out_dir.is_dir() {
        return None;
    }
    let targets: Vec<PathBuf> = TARGET_RELS
        .iter()
        .map(|rel| root.join(rel))
        .filter(|p| p.is_file())
        .collect();
    if targets.is_empty() {
        return None;
    }
    Some(CursorInstall {
        root: root.to_path_buf(),
        out_dir,
        product_json: root.join("product.json"),
        targets,
    })
}

pub fn target_statuses(install: &CursorInstall) -> Vec<TargetStatus> {
    TARGET_RELS
        .iter()
        .map(|rel| {
            let path = install.root.join(rel);
            let name = Path::new(rel)
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| rel.to_string());
            let exists = path.is_file();
            let patched = exists && crate::patch::file_is_patched(&path);
            let backup = crate::patch::bak_path(&path).is_file();
            TargetStatus {
                name,
                path: path.display().to_string(),
                exists,
                patched,
                backup,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_root_is_none() {
        assert!(inspect_root(Path::new("/definitely/not/cursor")).is_none());
    }
}
