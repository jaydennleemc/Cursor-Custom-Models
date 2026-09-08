use crate::config::{config_dir_path, AppConfig};
use crate::error::{AppError, Result};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProfilesState {
    #[serde(default)]
    pub active_profile: Option<String>,
    #[serde(default)]
    pub profiles: IndexMap<String, AppConfig>,
}

impl Default for ProfilesState {
    fn default() -> Self {
        Self {
            active_profile: None,
            profiles: IndexMap::new(),
        }
    }
}

fn profiles_file_path() -> Result<std::path::PathBuf> {
    Ok(config_dir_path()?.join("profiles.json"))
}

pub fn load_profiles() -> Result<ProfilesState> {
    let path = profiles_file_path()?;
    if !path.exists() {
        return Ok(ProfilesState::default());
    }
    let text = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&text)?)
}

pub fn save_profiles(state: &ProfilesState) -> Result<std::path::PathBuf> {
    let path = profiles_file_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let text = serde_json::to_string_pretty(state)?;
    fs::write(&path, text)?;
    Ok(path)
}

pub fn list_profiles() -> Result<ProfilesState> {
    load_profiles()
}

pub fn save_profile(name: &str, config: &AppConfig) -> Result<ProfilesState> {
    let mut state = load_profiles()?;
    state.profiles.insert(name.to_string(), config.clone());
    state.active_profile = Some(name.to_string());
    save_profiles(&state)?;
    Ok(state)
}

pub fn load_profile(name: &str) -> Result<AppConfig> {
    let state = load_profiles()?;
    state
        .profiles
        .get(name)
        .cloned()
        .ok_or_else(|| AppError::msg(format!("Profile '{name}' not found")))
}

pub fn delete_profile(name: &str) -> Result<ProfilesState> {
    let mut state = load_profiles()?;
    state.profiles.remove(name);
    if state.active_profile.as_deref() == Some(name) {
        state.active_profile = None;
    }
    save_profiles(&state)?;
    Ok(state)
}

pub fn set_active_profile(name: &str) -> Result<ProfilesState> {
    let mut state = load_profiles()?;
    if !state.profiles.contains_key(name) {
        return Err(AppError::msg(format!("Profile '{name}' not found")).into());
    }
    state.active_profile = Some(name.to_string());
    save_profiles(&state)?;
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_profiles_is_empty() {
        let state = ProfilesState::default();
        assert!(state.profiles.is_empty());
        assert!(state.active_profile.is_none());
    }

    #[test]
    fn profile_roundtrip() {
        let mut state = ProfilesState::default();
        let cfg = AppConfig::default();
        state.profiles.insert("test".into(), cfg.clone());
        state.active_profile = Some("test".into());

        let json = serde_json::to_string(&state).unwrap();
        let back: ProfilesState = serde_json::from_str(&json).unwrap();
        assert_eq!(state, back);
    }
}
