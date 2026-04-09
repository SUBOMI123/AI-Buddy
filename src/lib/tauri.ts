import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export async function checkScreenPermission(): Promise<boolean> {
  return invoke<boolean>("check_screen_permission");
}

export async function requestScreenPermission(): Promise<boolean> {
  return invoke<boolean>("request_screen_permission");
}

export async function toggleOverlay(): Promise<void> {
  return invoke("cmd_toggle_overlay");
}

export async function getShortcut(): Promise<string> {
  return invoke<string>("cmd_get_shortcut");
}

export async function setShortcut(shortcut: string): Promise<string> {
  return invoke<string>("cmd_set_shortcut", { shortcut });
}

export async function getInstallationToken(): Promise<string> {
  return invoke<string>("cmd_get_token");
}

export function onOverlayShown(callback: () => void) {
  return listen("overlay-shown", callback);
}

export function onOverlayHidden(callback: () => void) {
  return listen("overlay-hidden", callback);
}
