/**
 * Requisitions the buyer added by hand (18 Nov 2026). Kept per user in this browser only, like the
 * favourites, so they also work in the static preview; storage can be unavailable, so every access is guarded.
 */
import type { PurchaseRequisitionRecord } from "@scc/shared";
import type { DemoUser } from "./users";

const keyFor = (userId: string) => `scc-manual-requisitions-v1:${userId}`;

export function loadManualRequisitions(user: DemoUser): PurchaseRequisitionRecord[] {
  try {
    const raw = window.localStorage.getItem(keyFor(user.id));
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter(
          (r): r is PurchaseRequisitionRecord =>
            !!r && typeof r === "object" && (r as PurchaseRequisitionRecord).origin === "manual" && typeof (r as PurchaseRequisitionRecord).recordId === "string",
        )
      : [];
  } catch {
    return [];
  }
}

export function saveManualRequisitions(user: DemoUser, list: PurchaseRequisitionRecord[]): void {
  try {
    window.localStorage.setItem(keyFor(user.id), JSON.stringify(list));
  } catch {
    // Storage blocked: the added requisitions last until reload.
  }
}
