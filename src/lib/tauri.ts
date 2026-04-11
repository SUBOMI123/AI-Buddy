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

// ---- Phase 3: Voice I/O IPC wrappers ----

// PTT preference commands
export async function getPttKey(): Promise<string> {
  return invoke<string>("cmd_get_ptt_key");
}

export async function setPttKey(key: string): Promise<string> {
  return invoke<string>("cmd_set_ptt_key", { key });
}

// updatePttShortcut: persists new PTT key AND live re-registers the global shortcut.
// Use this from settings UI. setPttKey is for persistence-only callers.
export async function updatePttShortcut(key: string): Promise<string> {
  return invoke<string>("cmd_update_ptt_shortcut", { key });
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
export function onPttStart(callback: () => void) {
  return listen("ptt-start", () => callback());
}

export function onSttPartial(callback: (transcript: string) => void) {
  return listen<string>("stt-partial", (event) => callback(event.payload));
}

export function onSttFinal(callback: (transcript: string) => void) {
  return listen<string>("stt-final", (event) => callback(event.payload));
}

export function onSttError(callback: (error: string) => void) {
  return listen<string>("stt-error", (event) => callback(event.payload));
}

// ---- Phase 4: Screen Region Selection IPC wrappers ----

export interface RegionCoords {
  x: number;      // physical pixels
  y: number;      // physical pixels
  width: number;  // physical pixels
  height: number; // physical pixels
}

/** Show the full-screen region-select overlay window.
 *  Positions to cover primary monitor and sets focus. (D-02, RESEARCH Pattern 1) */
export async function openRegionSelect(): Promise<void> {
  return invoke("cmd_open_region_select");
}

/** Capture a specific screen region at physical pixel coordinates.
 *  Returns base64-encoded JPEG string. (D-08, D-09) */
export async function captureRegion(coords: RegionCoords): Promise<string> {
  return invoke<string>("capture_region", {
    x: coords.x,
    y: coords.y,
    width: coords.width,
    height: coords.height,
  });
}

/** Listen for region-selected event from the RegionSelect overlay window.
 *  Payload contains physical pixel coordinates converted by RegionSelect. (Pattern 7) */
export function onRegionSelected(callback: (coords: RegionCoords) => void) {
  return listen<RegionCoords>("region-selected", (event) => callback(event.payload));
}

/** Listen for region-cancelled event — emitted when user presses Escape or draws < 10px. */
export function onRegionCancelled(callback: () => void) {
  return listen("region-cancelled", () => callback());
}

// Phase 5: Learning & Adaptation — memory IPC wrappers

export interface GuidanceContext {
  tier: number;
  taskLabel: string;
  encounterCount: number;
}

/** Classifies intent + looks up encounter count. Call BEFORE streamGuidance. */
export async function prepareGuidanceContext(rawIntent: string): Promise<GuidanceContext> {
  return invoke<GuidanceContext>("cmd_prepare_guidance_context", { rawIntent });
}

/** Records completed interaction. Call fire-and-forget in onDone. */
export async function recordInteraction(
  taskLabel: string,
  rawIntent: string,
  guidance: string,
  tier: number,
  appContext?: string,
): Promise<void> {
  return invoke<void>("cmd_record_interaction", {
    taskLabel,
    rawIntent,
    appContext: appContext ?? null,
    guidance,
    tier,
  });
}

/** Returns a short memory context summary string for system prompt injection (D-08). */
export async function getMemoryContext(): Promise<string> {
  return invoke<string>("cmd_get_memory_context");
}

export interface SkillEntry {
  task_label: string;
  encounter_count: number;
}

export interface SkillProfile {
  strengths: SkillEntry[];
  recurring_struggles: SkillEntry[];
  apps_used: string[];
  total_interactions: number;
}

/** Returns derived skill profile from local memory DB (LEARN-03). */
export async function getSkillProfile(): Promise<SkillProfile> {
  return invoke<SkillProfile>("cmd_get_skill_profile");
}

// Phase 8: CTX-01 — OS-native active application detection
// Returns the frontmost app name (e.g. "Code", "Terminal") or null if unavailable.
// Uses active-win-pos-rs in Rust — no screenshot analysis (CTX-03).
export async function getActiveApp(): Promise<string | null> {
  return invoke<string | null>("cmd_get_active_app");
}
