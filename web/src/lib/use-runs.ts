"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentRun } from "@scc/shared";
import { api, type PurchaseRequestForm } from "./api";

/** One product of a request and the state of its agent run. */
export interface RunSlot {
  partId: string;
  form: PurchaseRequestForm;
  status: "queued" | "running" | "completed" | "failed";
  run: AgentRun | null;
  /** Why the run could not start or failed, e.g. the daily limit. */
  error: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs the agent for several products, one after the other (PLAN.md section 9):
 * the server allows one run at a time, and each live run counts towards the daily limit.
 */
export function useRuns({ onCompleted, onFinishedOne }: { onCompleted: (partId: string) => void; onFinishedOne: () => void }) {
  const [slots, setSlots] = useState<RunSlot[]>([]);
  // A new request or the saved fallback stops the loop of the previous request.
  const generation = useRef(0);
  const callbacks = useRef({ onCompleted, onFinishedOne });
  useEffect(() => {
    callbacks.current = { onCompleted, onFinishedOne };
  }, [onCompleted, onFinishedOne]);

  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  const update = useCallback((partId: string, change: Partial<RunSlot>) => {
    setSlots((prev) => prev.map((s) => (s.partId === partId ? { ...s, ...change } : s)));
  }, []);

  const startAll = useCallback(
    async (forms: PurchaseRequestForm[]) => {
      const mine = ++generation.current;
      setSlots(forms.map((form) => ({ partId: form.partId, form, status: "queued", run: null, error: null })));
      for (const form of forms) {
        if (generation.current !== mine) return;
        update(form.partId, { status: "running" });
        try {
          let run = await api.startRun(form);
          update(form.partId, { run });
          while (run.status === "running") {
            await sleep(1000);
            if (generation.current !== mine) return;
            run = await api.run(run.runId);
            update(form.partId, { run });
          }
          update(form.partId, { status: run.status, error: run.status === "failed" ? (run.error ?? "Run failed") : null });
          if (run.status === "completed") callbacks.current.onCompleted(form.partId);
        } catch (e) {
          update(form.partId, { status: "failed", error: e instanceof Error ? e.message : String(e) });
        }
        callbacks.current.onFinishedOne();
      }
    },
    [update],
  );

  /** Fallback: show saved real runs instead, each clearly marked with its date. */
  const showSaved = useCallback((saved: AgentRun[]) => {
    generation.current += 1;
    setSlots(
      saved.map((run) => ({
        partId: run.request.partId,
        form: { partId: run.request.partId, quantity: run.request.quantity, neededBy: run.request.neededBy },
        status: "completed",
        run,
        error: null,
      })),
    );
  }, []);

  /** Replace one failed product with its saved run. */
  const useSavedFor = useCallback((run: AgentRun) => {
    setSlots((prev) =>
      prev.map((s) => (s.partId === run.request.partId ? { ...s, status: "completed", run, error: null } : s)),
    );
  }, []);

  return { slots, startAll, showSaved, useSavedFor };
}
