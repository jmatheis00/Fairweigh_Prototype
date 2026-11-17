import type { CertificateRecord, CompanyEmissionsRecord, RatingHistoryEntry, RiskAlert, SupplierPerformanceMonth,
  AgentRun,
  BuyerRules,
  DecisionRecord,
  DemoSettings,
  DocumentRecord,
  ErpRecord,
  Offer,
  PcfRecord,
  PurchaseOrderRecord,
  PurchaseRequisitionRecord,
  RatingRecord,
  RunMode,
} from "@scc/shared";
import { validateRules } from "@scc/shared";
import { loadDecisions, saveDecisions } from "./decision-log";

/**
 * Static preview (decision of 6 Nov 2026, PLAN.md section 9): a build without
 * server that reads the same answers from JSON files recorded by
 * web/scripts/record-preview-snapshot.mjs. Off in the normal app.
 */
export const STATIC_PREVIEW = process.env.NEXT_PUBLIC_STATIC_PREVIEW === "1";

/** "/api/sim/documents?type=fine_notice" -> "snapshot/sim/documents_type_fine_notice.json" */
export function snapshotPath(apiPath: string): string {
  return `snapshot/${apiPath.replace(/^\/api\//, "").replace(/[?=&]/g, "_")}.json`;
}

const PREVIEW_RULES_KEY = "scc-preview-rules-v1";

// Recorded runs replayed in the static preview, by run ID.
const replayed = new Map<string, AgentRun>();

// Static preview: single records are looked up in the recorded lists (fewer files to host).
const listCache = new Map<string, Promise<{ supplierId: string; partId?: string }[]>>();
function staticList(listPath: string) {
  if (!listCache.has(listPath)) listCache.set(listPath, request(listPath));
  return listCache.get(listPath)!;
}
async function staticLookup<T>(path: string): Promise<T | undefined> {
  const one = /^\/api\/sim\/(erp|ratings)\/suppliers\/([^/?]+)$/.exec(path);
  const pcf = /^\/api\/sim\/pcf\/suppliers\/([^/]+)\/parts\/([^/?]+)$/.exec(path);
  if (!one && !pcf) return undefined;
  const list = await staticList(one ? `/api/sim/${one[1]}/suppliers` : "/api/sim/pcf");
  const hit = one
    ? list.find((r) => r.supplierId === decodeURIComponent(one[2]!))
    : list.find((r) => r.supplierId === decodeURIComponent(pcf![1]!) && r.partId === decodeURIComponent(pcf![2]!));
  if (!hit) throw new Error("Not found in the preview data");
  return hit as T;
}

/** Reads the error message NestJS sends, e.g. "No offers for Ball bearing in this demo". */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (STATIC_PREVIEW) {
    const found = await staticLookup<T>(path);
    if (found !== undefined) return found;
  }
  const res = await fetch(STATIC_PREVIEW ? snapshotPath(path) : path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new Error(message ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export interface PurchaseRequestForm {
  partId: string;
  quantity: number;
  neededBy: string | null;
}

export const api = {
  settings: () => request<DemoSettings>("/api/sim/settings"),
  mode: () => request<RunMode>("/api/agent/mode"),
  usage: () => request<{ liveRunsToday: number; dailyLimit: number }>("/api/agent/usage"),
  startRun: async (form: PurchaseRequestForm): Promise<AgentRun> => {
    if (STATIC_PREVIEW) {
      // Replay the run recorded for this product, with the quantity and date of the form.
      const recorded = await request<AgentRun>(`/api/agent/recorded/${form.partId}`);
      const run: AgentRun = {
        ...recorded,
        runId: `${recorded.runId}-${Date.now()}`,
        request: { ...recorded.request, quantity: form.quantity, neededBy: form.neededBy },
      };
      replayed.set(run.runId, run);
      return { ...run, status: "running", finishedAt: null, steps: run.steps.slice(0, 1) };
    }
    return request<AgentRun>("/api/agent/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
  },
  run: async (runId: string): Promise<AgentRun> => {
    if (STATIC_PREVIEW) {
      const run = replayed.get(runId);
      if (!run) throw new Error(`Unknown run ${runId}`);
      return run;
    }
    return request<AgentRun>(`/api/agent/runs/${encodeURIComponent(runId)}`);
  },
  /** The latest saved real run (for one product, if given), or null if none exists yet. */
  latestSaved: async (partId?: string): Promise<AgentRun | null> => {
    if (STATIC_PREVIEW) return null; // no saved real runs in the preview
    const res = await fetch(`/api/agent/runs/saved/latest${partId ? `?partId=${encodeURIComponent(partId)}` : ""}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return (await res.json()) as AgentRun;
  },
  rules: async (): Promise<BuyerRules> => {
    const recorded = await request<BuyerRules>("/api/rules");
    if (!STATIC_PREVIEW) return recorded;
    // Static preview: a change is kept in this viewer's browser only.
    try {
      const own = window.localStorage.getItem(PREVIEW_RULES_KEY);
      // Rules saved before a field existed keep the recorded value for it.
      return own ? { ...recorded, ...(JSON.parse(own) as Partial<BuyerRules>) } : recorded;
    } catch {
      return recorded;
    }
  },
  saveRules: async (rules: Omit<BuyerRules, "updatedAt">): Promise<BuyerRules> => {
    if (STATIC_PREVIEW) {
      const saved = validateRules(rules, rules.updatedBy ?? "", new Date().toISOString());
      try {
        window.localStorage.setItem(PREVIEW_RULES_KEY, JSON.stringify(saved));
      } catch {
        // storage blocked: the change lasts until reload
      }
      return saved;
    }
    return request<BuyerRules>("/api/rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rules),
    });
  },
  resetRules: async (): Promise<BuyerRules> => {
    if (STATIC_PREVIEW) {
      try {
        window.localStorage.removeItem(PREVIEW_RULES_KEY);
      } catch {
        // ignore
      }
      return request<BuyerRules>("/api/rules");
    }
    return request<BuyerRules>("/api/rules", { method: "DELETE" });
  },
  /** Decision Log on the server; the static preview keeps it in this viewer's browser. */
  decisions: async (): Promise<DecisionRecord[]> => (STATIC_PREVIEW ? loadDecisions() : request<DecisionRecord[]>("/api/decisions")),
  /** Adds one decision. Throws if it could not be saved. */
  saveDecision: async (record: DecisionRecord): Promise<void> => {
    if (STATIC_PREVIEW) {
      if (!saveDecisions([...loadDecisions(), record])) throw new Error("This browser does not allow saving.");
      return;
    }
    await request<DecisionRecord>("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
  },
  pcfList: () => request<PcfRecord[]>("/api/sim/pcf"),
  quotations: () => request<Offer[]>("/api/sim/erp/quotations"),
  supplierPerformance: () => request<SupplierPerformanceMonth[]>("/api/sim/erp/supplier-performance"),
  ratingHistory: () => request<RatingHistoryEntry[]>("/api/sim/ratings/history"),
  certificates: () => request<CertificateRecord[]>("/api/sim/ratings/certificates"),
  companyEmissions: () => request<CompanyEmissionsRecord[]>("/api/sim/ratings/company-emissions"),
  riskAlerts: () => request<RiskAlert[]>("/api/sim/risk/alerts"),
  fineNotices: () => request<DocumentRecord[]>("/api/sim/documents?type=fine_notice"),
  exampleDecisions: () => request<DecisionRecord[]>("/api/sim/example-decisions"),
  purchaseOrders: () => request<PurchaseOrderRecord[]>("/api/sim/erp/purchase-orders"),
  requisitions: () => request<PurchaseRequisitionRecord[]>("/api/sim/erp/purchase-requisitions"),
  erpList: () => request<ErpRecord[]>("/api/sim/erp/suppliers"),
  ratingList: () => request<RatingRecord[]>("/api/sim/ratings/suppliers"),
  erp: (supplierId: string) => request<ErpRecord>(`/api/sim/erp/suppliers/${encodeURIComponent(supplierId)}`),
  rating: (supplierId: string) =>
    request<RatingRecord>(`/api/sim/ratings/suppliers/${encodeURIComponent(supplierId)}`),
  pcf: (supplierId: string, partId: string) =>
    request<PcfRecord>(
      `/api/sim/pcf/suppliers/${encodeURIComponent(supplierId)}/parts/${encodeURIComponent(partId)}`,
    ),
  document: (documentId: string) =>
    request<DocumentRecord>(`/api/sim/documents/${encodeURIComponent(documentId)}`),
  documentFileUrl: (documentId: string, page: number) =>
    STATIC_PREVIEW
      ? `snapshot/sim/documents/${documentId}/file.pdf#page=${page}`
      : `/api/sim/documents/${encodeURIComponent(documentId)}/file#page=${page}`,
};
