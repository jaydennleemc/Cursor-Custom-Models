import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, AppStatus, ConnectionTest, OpResult, ProfilesState, ProxySettings } from "./types";

export const getStatus = () => invoke<AppStatus>("get_status");
export const getConfig = () => invoke<AppConfig>("get_config");
export const saveConfig = (config: AppConfig) =>
  invoke<string>("save_config", { config });
export const getProxySettings = () => invoke<ProxySettings>("get_proxy_settings");
export const saveProxySettings = (settings: ProxySettings) =>
  invoke<string>("save_proxy_settings", { settings });
export const startPatch = (config: AppConfig) =>
  invoke<OpResult>("start_patch", { config });
export const stopRestore = (force: boolean) =>
  invoke<OpResult>("stop_restore", { force });
export const startProxy = (settings: ProxySettings) =>
  invoke<string>("start_proxy", { settings });
export const stopProxy = () => invoke<string>("stop_proxy");
export const defaultConfig = () => invoke<AppConfig>("default_config");
export const openConfigDir = () => invoke<void>("open_config_dir");
export const testConnection = (config: AppConfig) =>
  invoke<ConnectionTest>("test_connection", { config });
export const listProfiles = () => invoke<ProfilesState>("list_profiles");
export const saveProfile = (name: string, config: AppConfig) =>
  invoke<ProfilesState>("save_profile", { name, config });
export const loadProfile = (name: string) =>
  invoke<AppConfig>("load_profile", { name });
export const deleteProfile = (name: string) =>
  invoke<ProfilesState>("delete_profile", { name });
export const setActiveProfile = (name: string) =>
  invoke<ProfilesState>("set_active_profile", { name });
export const openCursor = () => invoke<string>("open_cursor");
export const quitCursor = () => invoke<string>("quit_cursor");
export const openLogFile = () => invoke<string>("open_log_file");
