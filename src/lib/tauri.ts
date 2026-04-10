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

export async function captureScreenshot(): Promise<string> {
  return invoke<string>("capture_screenshot");
}

export function onOverlayShown(callback: () => void) {
  return listen("overlay-shown", callback);
}

export function onOverlayHidden(callback: () => void) {
  return listen("overlay-hidden", callback);
}

// ---- Phase 3: Voice I/O IPC wrappers ----

// PTT preference commands
export async function getPttKey(): Promise<string> {
  return invoke<string>("cmd_get_ptt_key");
}

export async function setPttKey(key: string): Promise<string> {
  return invoke<string>("cmd_set_ptt_key", { key });
}

export async function getAudioCuesEnabled(): Promise<boolean> {
  return invoke<boolean>("cmd_get_audio_cues_enabled");
}

export async function setAudioCuesEnabled(enabled: boolean): Promise<void> {
  return invoke("cmd_set_audio_cues_enabled", { enabled });
}

// TTS preference commands
export async function getTtsEnabled(): Promise<boolean> {
  return invoke<boolean>("cmd_get_tts_enabled");
}

export async function setTtsEnabled(enabled: boolean): Promise<void> {
  return invoke("cmd_set_tts_enabled", { enabled });
}

// TTS playback command — fire-and-forget from frontend perspective
// Returns after audio begins (not after it finishes)
export async function playTts(text: string): Promise<void> {
  return invoke("cmd_play_tts", { text });
}

// STT Tauri event listeners
// Used by SidebarShell to receive transcript events from the Rust PTT pipeline
export function onSttPartial(callback: (transcript: string) => void) {
  return listen<string>("stt-partial", (event) => callback(event.payload));
}

export function onSttFinal(callback: (transcript: string) => void) {
  return listen<string>("stt-final", (event) => callback(event.payload));
}

export function onSttError(callback: (error: string) => void) {
  return listen<string>("stt-error", (event) => callback(event.payload));
}
