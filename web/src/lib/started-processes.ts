/**
 * Purchase processes the buyer has started (18 Nov 2026), kept per user in this browser like the manual
 * requisitions, so "My open requests" with their step, evidence and decision survive a reload, also in the
 * static preview. Storage can be unavailable or hold old data, so every access is guarded and checked.
 */
import { restoreStartedProcesses, type StartedProcess } from "@scc/shared";
import type { DemoUser } from "./users";

const keyFor = (userId: string) => `scc-started-processes-v1:${userId}`;

export function loadStartedProcesses(user: DemoUser): Record<string, StartedProcess> {
  try {
    const raw = window.localStorage.getItem(keyFor(user.id));
    return raw === null ? {} : restoreStartedProcesses(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveStartedProcesses(user: DemoUser, processes: Record<string, StartedProcess>): void {
  try {
    window.localStorage.setItem(keyFor(user.id), JSON.stringify(processes));
  } catch {
    // Storage blocked or full: the started processes last until reload.
  }
}
