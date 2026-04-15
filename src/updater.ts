import { check } from '@tauri-apps/plugin-updater';
import { ask } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';

/**
 * Checks for app updates on launch. Silent if up to date.
 * Shows an in-app dialog if a newer version is available.
 * Called from SidebarShell onMount — fire-and-forget, errors swallowed.
 */
export async function checkForAppUpdates(): Promise<void> {
  try {
    const update = await check();
    if (!update) return; // No update available — silent

    const yes = await ask(
      `Version ${update.version} is available.\n\nInstall now?`,
      {
        title: 'Update Available',
        okLabel: 'Install & Restart',
        cancelLabel: 'Later',
      }
    );

    if (yes) {
      await update.downloadAndInstall();
      await relaunch();
    }
  } catch (e) {
    // Silently swallow network errors on launch — do not block startup
    console.warn('[updater] check failed:', e);
  }
}
