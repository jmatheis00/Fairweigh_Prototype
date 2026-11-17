import type { DecisionRecord } from "@scc/shared";

/**
 * Decision log in the browser: used only by the static preview, which has no server
 * (the normal app saves decisions on the server, PLAN.md section 6).
 * Storage can be unavailable (private window, blocked site data), so every
 * access is guarded and the cockpit works without it.
 */
const KEY = "scc-decision-log-v1";

export function loadDecisions(): DecisionRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as DecisionRecord[]) : [];
  } catch {
    return [];
  }
}

/** Returns false if the browser does not allow saving. */
export function saveDecisions(records: DecisionRecord[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

/** Offers the CSV as a file download. */
export function downloadCsv(csv: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
