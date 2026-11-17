"use client";

import dayjs from "dayjs";
import { ArrowLeftOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, ConfigProvider, Flex, Form, Layout, Tag, Tooltip } from "antd";
import { SidePanel } from "./side-panel";
import {
  CRITERIA,
  DEFAULT_WEIGHTS,
  buildDecisionInput,
  targetOverview,
  decide,
  formatDay,
  nearestFlip,
  weightBounds,
  weightSensitivity,
  withAssumedValues,
  whatItTakesToLead,
  workQueue,
  runModeLabel,
  type AgentRun,
  type BuyerRules,
  type DecisionRecord,
  type DemoSettings,
  type Evidence,
  type PurchaseOrderRecord,
  type PurchaseRequisitionRecord,
  type QueueEntry,
  type RunMode,
  type Weights,
} from "@scc/shared";
import { api } from "@/lib/api";
import { useRuns } from "@/lib/use-runs";
import { loadFavourites, saveFavourites } from "@/lib/favourites";
import { TOPIC_LABEL } from "@/lib/labels";
import { shortName } from "@/lib/names";
import { theme } from "@/lib/theme";
import { DEMO_USERS, NAV_BY_ROLE, START_PAGE, VIEW_ONLY_HINT, loadUser, saveUser, type DemoUser } from "@/lib/users";
import { AppHeader, HeaderTag, type AppPage } from "./app-header";
import { ScoreHelp } from "./score-help";
import { SignedOut } from "./signed-out";
import { SuppliersPage } from "./suppliers-page";
import { SupplierInfoPanel } from "./supplier-info-panel";
import { SustainabilityPage } from "./sustainability-page";
import { RulesPage } from "./rules-page";
import { ResultsPage } from "./results-page";
import { GlossaryPage } from "./glossary-page";
import { TargetsPage } from "./targets-page";
import { CpoDashboard } from "./cpo-dashboard";
import { WorkQueuePage } from "./work-queue-page";
import { ProcessSteps, type ProcessStep } from "./process-steps";
import { ReviewStep, type RequirementValues } from "./review-step";
import { AboutDialog } from "./about-dialog";
import { CollectStep } from "./collect-step";
import { DecideStep } from "./decide-step";
import { CompleteStep } from "./complete-step";
import { DecisionLog } from "./decision-log";
import { DecisionMatrix } from "./decision-matrix";
import { EvidenceDrawer } from "./evidence-drawer";
import { EvidenceTable } from "./evidence-table";
import { RecommendationBlock } from "./decision-summary";
import { RecommendationDetails } from "./kpi-tiles";
import { InfoTip } from "./info-tip";
import { MissingData } from "./missing-data";
import { MAP_TIP, PositioningMap } from "./positioning-map";
import { SupplierProfile } from "./supplier-profile";
import { WEIGHTS_TIP, WeightsPanel, weightSum } from "./weights-bar";

type PanelKind = "evidence" | "missing" | "log" | "decisions" | "why";

interface SupplierInfo {
  name: string;
  relationshipStatus: string;
}

/** Process steps in the address bar, e.g. #/process/PR-10041219/compare. */
const STEP_SLUGS = ["request", "collect", "compare", "decide", "complete"] as const;
/** Page names in the address bar follow the navigation labels, not the internal keys. */
const PAGE_SLUGS: Partial<Record<AppPage, string>> = { queue: "work-queue", impact: "results", sustainability: "co2-and-risks", targets: "co2-targets" };
const pageFromSlug = (slug: string): string => (Object.entries(PAGE_SLUGS).find(([, v]) => v === slug)?.[0] ?? slug);

/** One purchase process started from the work queue (expert interviews, 10 Nov 2026). */
interface Process {
  requisition: PurchaseRequisitionRecord;
  quantity: number;
  neededBy: string | null;
  step: ProcessStep;
  reached: ProcessStep;
  run: AgentRun | null;
  record: DecisionRecord | null;
}

/** Which AI service collects the evidence, for "About Fairweigh". */
function aiService(mode: RunMode | null): string {
  if (!mode) return "-";
  if (mode.kind === "live") return mode.provider === "gemini" ? "Google Gemini API" : "Groq API";
  if (mode.kind === "saved") return "Saved run, no AI call";
  return "Test mode, no external AI";
}

export function CockpitShell() {
  const [baseSettings, setSettings] = useState<DemoSettings | null>(null);
  // Rules of the Scope 3 manager; they override the thresholds and the CO₂ price of the demo settings.
  const [rules, setRules] = useState<BuyerRules | null>(null);
  const settings = useMemo<DemoSettings | null>(
    () =>
      baseSettings && rules
        ? {
            ...baseSettings,
            priceMaxAgeDays: rules.priceMaxAgeDays,
            co2MaxAgeDays: rules.co2MaxAgeDays,
            co2PricePerTonneEur: rules.co2PricePerTonneEur,
            // A price set by the Scope 3 manager no longer counts as a placeholder.
            co2PriceToConfirm: rules.updatedBy ? false : baseSettings.co2PriceToConfirm,
          }
        : baseSettings,
    [baseSettings, rules],
  );
  const [mode, setMode] = useState<RunMode | null>(null);
  const [usage, setUsage] = useState<{ liveRunsToday: number; dailyLimit: number } | null>(null);
  const [page, setPage] = useState<AppPage>("queue");
  const [user, setUser] = useState<DemoUser>(DEMO_USERS[0]);
  const [signedOut, setSignedOut] = useState(false);
  // Which help is open: "How it works" from the header, "How is the score calculated?" from the recommendation.
  const [help, setHelp] = useState<"how" | "score" | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Record<string, SupplierInfo>>({});
  const [selected, setSelected] = useState<Evidence | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelKind | null>(null);
  // Decision to show expanded when the Decision Log opens.
  const [logRecordId, setLogRecordId] = useState<string | null>(null);
  // Supplier to open on the suppliers page (links from the Decision Log and Results).
  const [openSupplierId, setOpenSupplierId] = useState<string | null>(null);
  // Supplier info over the current page, e.g. from a link on Results (feedback 17 Nov 2026).
  const [infoSupplierId, setInfoSupplierId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  // Example decisions from the source data, shown before the recorded ones.
  const [examples, setExamples] = useState<DecisionRecord[]>([]);
  const [allNames, setAllNames] = useState<Record<string, string>>({});
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  // Latest saved real run per product (fallback, PLAN.md section 4).
  const [savedRuns, setSavedRuns] = useState<AgentRun[]>([]);
  // Work queue: open requisitions from the ERP only; the cockpit never creates requisitions or orders (17 Nov 2026).
  const [requisitions, setRequisitions] = useState<PurchaseRequisitionRecord[]>([]);
  const [requisitionsLoaded, setRequisitionsLoaded] = useState(false);
  /** True once the address of the first load has been applied; only then does the app write addresses. */
  const [routeReady, setRouteReady] = useState(false);
  const [orders, setOrders] = useState<PurchaseOrderRecord[]>([]);
  const [processes, setProcesses] = useState<Record<string, Process>>({});
  const [activeReqId, setActiveReqId] = useState<string | null>(null);
  // Product of the open process, kept as its own value so the weights do not depend on the process object.
  const [activePartId, setActivePartId] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<string[]>([]);
  // The requirement form of step 1; the progress bar submits it like "Next".
  const [reviewForm] = Form.useForm<RequirementValues>();
  // Weights per product: the company default of the commodity group until the buyer changes them.
  // The ranking uses the last weights that add up to 100 %.
  const [weightsByPart, setWeightsByPart] = useState<Record<string, { weights: Weights; applied: Weights }>>({});

  const process = activeReqId ? (processes[activeReqId] ?? null) : null;
  const updateProcess = useCallback((id: string, change: Partial<Process>) => {
    setProcesses((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id]!, ...change } } : prev));
  }, []);

  const refreshUsage = useCallback(() => {
    api.usage().then(setUsage).catch(() => {});
  }, []);
  const onCompleted = useCallback(() => {}, []);
  const { slots, startAll, showSaved: showSavedRuns, useSavedFor } = useRuns({ onCompleted, onFinishedOne: refreshUsage });
  const activeSlot = process ? (slots.find((s) => s.partId === process.requisition.partId) ?? null) : null;
  const run = activeSlot?.status === "completed" ? activeSlot.run : null;

  // A finished run belongs to the open process, so it comes back when the buyer returns to it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror the finished run into its process
    if (activeReqId && run && processes[activeReqId]?.run !== run) updateProcess(activeReqId, { run });
  }, [activeReqId, run, processes, updateProcess]);

  // Recorded decisions (server), favourites and the last demo user (this browser).
  useEffect(() => {
    api.decisions().then(setDecisions).catch(() => setStorageAvailable(false));
    const stored = loadUser();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage once after mount
    setFavourites(loadFavourites(stored));
    setUser(stored);
    setPage(START_PAGE[stored.role] as AppPage);
  }, []);

  const switchUser = useCallback((next: DemoUser) => {
    setUser(next);
    setFavourites(loadFavourites(next));
    saveUser(next);
    setSignedOut(false);
    setPanel(null);
    setProfileId(null);
    setSelected(null);
    setPage(START_PAGE[next.role] as AppPage);
    // No banner on switching (16 Nov 2026): the header shows name and role, like in other SaaS tools.
    setNotice(null);
  }, []);

  const toggleFavourite = useCallback(
    (supplierId: string) => {
      setFavourites((prev) => {
        const next = prev.includes(supplierId) ? prev.filter((id) => id !== supplierId) : [...prev, supplierId];
        saveFavourites(user, next);
        return next;
      });
    },
    [user],
  );

  useEffect(() => {
    api.exampleDecisions().then(setExamples).catch(() => setExamples([]));
    api
      .requisitions()
      .then(setRequisitions)
      .catch(() => setRequisitions([]))
      .finally(() => setRequisitionsLoaded(true));
    api.purchaseOrders().then(setOrders).catch(() => setOrders([]));
    api
      .erpList()
      .then((erp) => setAllNames(Object.fromEntries(erp.map((e) => [e.supplierId, e.supplierName]))))
      .catch(() => {});
    api.rules().then(setRules).catch(() => setRules(null));
    Promise.all([api.settings(), api.mode(), api.usage()])
      .then(async ([s, m, u]) => {
        setSettings(s);
        setMode(m);
        setUsage(u);
        const saved = await Promise.all(
          s.catalog.filter((p) => p.hasOffers).map((p) => api.latestSaved(p.partId).catch(() => null)),
        );
        setSavedRuns(saved.filter((r): r is AgentRun => r !== null));
      })
      .catch((e: unknown) => setError(`Server not reachable: ${e instanceof Error ? e.message : String(e)}`));
  }, []);

  // Names and relationship status come from the ERP, like every other value.
  const allSupplierIds = useMemo(() => [...new Set(slots.flatMap((s) => s.run?.request.supplierIds ?? []))], [slots]);
  useEffect(() => {
    for (const id of allSupplierIds) {
      if (suppliers[id]) continue;
      api
        .erp(id)
        .then((erp) =>
          setSuppliers((s) => ({
            ...s,
            [id]: { name: erp.supplierName, relationshipStatus: erp.relationshipStatus },
          })),
        )
        .catch(() => {});
    }
  }, [allSupplierIds, suppliers]);

  const log = useMemo(() => [...examples, ...decisions], [examples, decisions]);
  const queue: QueueEntry[] = useMemo(
    // The example decisions close their sample requisitions from July 2026, so they count here too.
    () => workQueue(requisitions, log, new Set(Object.keys(processes))),
    [requisitions, log, processes],
  );
  // CO₂ targets on three levels (expert interviews, 10 Nov 2026); the buyer's own row feeds the work queue.
  const today = dayjs().format("YYYY-MM-DD");
  const targetInputs = useMemo(
    () => ({ orders, decisions, catalog: settings?.catalog ?? [], year: 2026, today }),
    [orders, decisions, settings, today],
  );
  const overview = useMemo(
    () =>
      settings && rules
        ? targetOverview({ ...targetInputs, buyers: settings.buyers ?? [], targets: rules.co2Targets ?? settings.defaultCo2Targets })
        : null,
    [targetInputs, settings, rules],
  );
  const myRow = overview?.byBuyer.find((b) => b.key === user.name) ?? null;
  const progress = useMemo(() => (myRow && overview ? { ...myRow, year: overview.year } : null), [myRow, overview]);

  const closePanels = useCallback(() => {
    setSelected(null);
    setProfileId(null);
    setPanel(null);
  }, []);

  // Primitive arguments only, so no process object is handed out (React Compiler).
  const startRun = useCallback(
    (runPartId: string, quantity: number, neededBy: string | null) => {
      void startAll([{ partId: runPartId, quantity, neededBy }]);
    },
    [startAll],
  );

  const startProcess = useCallback(
    (requisition: PurchaseRequisitionRecord) => {
      closePanels();
      setError(null);
      const p: Process = {
        requisition,
        quantity: requisition.quantity,
        neededBy: requisition.neededBy,
        step: 0,
        reached: 0,
        run: null,
        record: null,
      };
      setProcesses((prev) => ({ ...prev, [requisition.recordId]: p }));
      setActiveReqId(requisition.recordId);
      setActivePartId(requisition.partId);
      // A new process starts with the company default weights.
      setWeightsByPart((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== requisition.partId)));
      setPage("process");
    },
    [closePanels],
  );

  const resumeProcess = useCallback(
    (entry: QueueEntry) => {
      const p = processes[entry.requisition.recordId];
      // Sourcing started earlier, outside this browser session (sample requisition): continue at the requirement.
      if (!p) return startProcess(entry.requisition);
      closePanels();
      setActiveReqId(entry.requisition.recordId);
      setActivePartId(entry.requisition.partId);
      // The finished run of this process comes back; a run still going for it keeps going.
      if (p.run && !slots.some((s) => s.partId === p.requisition.partId && s.run?.runId === p.run!.runId)) showSavedRuns([p.run]);
      setPage("process");
    },
    [processes, slots, showSavedRuns, closePanels, startProcess],
  );

  const goToStep = useCallback(
    (step: ProcessStep) => {
      if (!activeReqId) return;
      closePanels();
      setProcesses((prev) => {
        const p = prev[activeReqId];
        if (!p) return prev;
        return { ...prev, [activeReqId]: { ...p, step, reached: Math.max(p.reached, step) as ProcessStep } };
      });
    },
    [activeReqId, closePanels],
  );

  const recordDecision = useCallback(
    (record: DecisionRecord) => {
      setDecisions((prev) => [...prev, record]);
      api.saveDecision(record).then(
        () => setStorageAvailable(true),
        () => setStorageAvailable(false),
      );
      if (activeReqId) {
        setProcesses((prev) => (prev[activeReqId] ? { ...prev, [activeReqId]: { ...prev[activeReqId]!, record, step: 4, reached: 4 } } : prev));
      }
    },
    [activeReqId],
  );

  const partId = activePartId;
  const catalogPart = useMemo(() => settings?.catalog.find((p) => p.partId === partId) ?? null, [settings, partId]);
  const defaultWeights: Weights = useMemo(() => catalogPart?.defaultWeights ?? DEFAULT_WEIGHTS, [catalogPart]);
  const ownWeights = partId ? weightsByPart[partId] : undefined;
  const weights = ownWeights?.weights ?? defaultWeights;
  const appliedWeights = ownWeights?.applied ?? defaultWeights;
  const changeWeights = useCallback(
    (next: Weights) => {
      if (!partId) return;
      setWeightsByPart((prev) => ({
        ...prev,
        [partId]: { weights: next, applied: weightSum(next) === 100 ? next : (prev[partId]?.applied ?? defaultWeights) },
      }));
    },
    [partId, defaultWeights],
  );
  const weightsComplete = weightSum(weights) === 100;

  const decisionInput = useMemo(
    () =>
      run?.status === "completed" && settings
        ? buildDecisionInput(run, {
            today: dayjs().format("YYYY-MM-DD"),
            priceMaxAgeDays: settings.priceMaxAgeDays,
            co2MaxAgeDays: settings.co2MaxAgeDays,
            flagEstimatedCo2: rules?.flagEstimatedCo2 ?? false,
          })
        : null,
    [run, settings, rules],
  );
  // Reference values of the product: what we have today, i.e. the current supplier (decision of 17 Nov 2026).
  const benchmarks = useMemo(() => catalogPart?.benchmarks ?? null, [catalogPart]);
  const assumption = useMemo(() => catalogPart?.newSupplierAssumption ?? null, [catalogPart]);
  // Suppliers that never delivered (quote or new candidate) get the weakest values of our current suppliers.
  const neverDelivered = useMemo(
    () =>
      new Set(
        Object.entries(suppliers)
          .filter(([, s]) => s.relationshipStatus === "Quote only" || s.relationshipStatus === "New - found by AI agent")
          .map(([id]) => id),
      ),
    [suppliers],
  );
  const scoredInput = useMemo(
    () => (decisionInput ? withAssumedValues(decisionInput, assumption, neverDelivered) : null),
    [decisionInput, assumption, neverDelivered],
  );
  const result = useMemo(
    () => (scoredInput ? decide(scoredInput, appliedWeights, benchmarks) : null),
    [scoredInput, appliedWeights, benchmarks],
  );
  // Robustness: at which weight would another offer lead? Only inside the allowed range (±10 points).
  const sensitivity = useMemo(() => {
    if (!scoredInput) return [];
    const bounds = weightBounds(defaultWeights);
    return weightSensitivity(scoredInput, appliedWeights, benchmarks).map((s) =>
      s.flipsAt !== null && (s.flipsAt < bounds[s.criterion].min || s.flipsAt > bounds[s.criterion].max)
        ? { ...s, flipsAt: null, direction: null, newLeaderId: null }
        : s,
    );
  }, [scoredInput, appliedWeights, benchmarks, defaultWeights]);

  // One side panel at a time.
  const openEvidence = useCallback((e: Evidence) => {
    setProfileId(null);
    setPanel(null);
    setSelected(e);
  }, []);
  const openProfile = useCallback((supplierId: string) => {
    setSelected(null);
    setPanel(null);
    setProfileId(supplierId);
  }, []);
  const openPanel = useCallback((p: PanelKind) => {
    setSelected(null);
    setProfileId(null);
    setPanel(p);
  }, []);
  const openDecision = useCallback(
    (record: DecisionRecord) => {
      setLogRecordId(record.recordId);
      openPanel("decisions");
    },
    [openPanel],
  );
  // A supplier link from the Decision Log or Results opens the supplier's details on the suppliers page.
  const openSupplierPage = useCallback((supplierId: string) => {
    setPanel(null);
    setProfileId(null);
    setSelected(null);
    setOpenSupplierId(supplierId);
    setPage("suppliers");
  }, []);

  const supplierNames = useMemo(() => Object.fromEntries(Object.entries(suppliers).map(([id, s]) => [id, s.name])), [suppliers]);
  const partNames = useMemo(() => Object.fromEntries((settings?.catalog ?? []).map((p) => [p.partId, p.partName])), [settings]);
  const shownMode = run?.mode ?? mode;
  // Current supplier of this part from the ERP source list; older data: the offer with an active contract.
  const currentSupplierId =
    (catalogPart?.currentSupplierId && run?.request.supplierIds.includes(catalogPart.currentSupplierId) ? catalogPart.currentSupplierId : null) ??
    run?.request.supplierIds.find((id) => suppliers[id]?.relationshipStatus === "Active contract") ??
    null;

  // A role only reaches its own pages (expert interviews, 10 Nov 2026).
  // The glossary is open to every role from the help menu (16 Nov 2026).
  const allowed = useMemo(() => [...NAV_BY_ROLE[user.role], "glossary"] as string[], [user.role]);
  const shownPage: AppPage = allowed.includes(page) && (page !== "process" || process) ? page : (START_PAGE[user.role] as AppPage);

  // An address per page and process step (review 16 Nov 2026), so Back, Forward, reload and shared links work.
  // Hash addresses (#/suppliers, #/process/PR-…/compare) work the same in the dev server and the static preview.
  const address =
    shownPage === "process" && process
      ? `#/process/${encodeURIComponent(process.requisition.recordId)}/${STEP_SLUGS[process.step]}`
      : `#/${PAGE_SLUGS[shownPage] ?? shownPage}`;

  const openAddress = useCallback(
    (hash: string) => {
      const [slug, reqId, stepSlug] = hash.replace(/^#\/?/, "").split("/");
      const kind = slug ? pageFromSlug(slug) : slug;
      if (kind === "process" && reqId) {
        const id = decodeURIComponent(reqId);
        const existing = processes[id];
        if (existing) {
          resumeProcess({ requisition: existing.requisition } as QueueEntry);
          // Only steps already reached can be opened; a link to a later step opens the furthest one reached.
          const wanted = STEP_SLUGS.indexOf(stepSlug as (typeof STEP_SLUGS)[number]);
          if (wanted >= 0) {
            setProcesses((prev) => {
              const p = prev[id];
              return p ? { ...prev, [id]: { ...p, step: Math.min(wanted, p.reached) as ProcessStep } } : prev;
            });
          }
          return;
        }
        // After a reload the evidence of the earlier run is gone, so the process starts again at "Request".
        const entry = queue.find((e) => e.requisition.recordId === id);
        if (entry && user.canRun && entry.status !== "decided") startProcess(entry.requisition);
        return;
      }
      if (kind && allowed.includes(kind) && kind !== "process") {
        closePanels();
        if (kind !== "suppliers") setOpenSupplierId(null);
        setPage(kind as AppPage);
      }
    },
    [processes, queue, user, allowed, resumeProcess, startProcess, closePanels],
  );

  // First load: open the page in the address once the requisitions are known (a process link needs them).
  useEffect(() => {
    if (routeReady || !requisitionsLoaded) return;
    /* eslint-disable react-hooks/set-state-in-effect -- apply the address of the first load once */
    openAddress(window.location.hash);
    setRouteReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [routeReady, requisitionsLoaded, openAddress]);

  // Every page or step change gets its own history entry, so the browser's Back button goes one step back.
  useEffect(() => {
    if (!routeReady || window.location.hash === address) return;
    window.history.pushState(null, "", address);
  }, [address, routeReady]);

  // Back, Forward and an edited address.
  useEffect(() => {
    const onPop = () => openAddress(window.location.hash);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openAddress]);

  const compareView =
    run && result && process ? (
      <Flex vertical gap={12}>
        <RecommendationBlock
          run={run}
          result={result}
          supplierNames={supplierNames}
          currentSupplierId={currentSupplierId}
          co2PricePerTonneEur={settings?.co2PricePerTonneEur ?? 0}
          partName={process?.requisition.partName ?? catalogPart?.partName ?? run.request.partId}
          onWhy={() => openPanel("why")}
          onShowEvidence={() => openPanel("evidence")}
          onShowMissing={() => openPanel("missing")}
          onShowLog={() => openPanel("log")}
        />
        <div className="dash-grid">
          <Card
            className="dash-card"
            size="small"
            title={
              <>
                Offer comparison <InfoTip label="the offer comparison" title="Click a value for its source · a supplier for its details" />
              </>
            }
            styles={{ body: { padding: 0 } }}
          >
            {!weightsComplete && (
              <Alert
                type="warning"
                showIcon
                banner
                title={`Weights add up to ${weightSum(weights)} %. The ranking shows the last complete weights (${CRITERIA.map((c) => `${TOPIC_LABEL[c]} ${appliedWeights[c]} %`).join(", ")}).`}
              />
            )}
            <DecisionMatrix
              run={run}
              result={result}
              supplierNames={supplierNames}
              selectedId={selected?.evidenceId ?? null}
              onOpen={openEvidence}
              onOpenSupplier={openProfile}
              benchmarks={benchmarks}
              industryCo2={catalogPart?.industryCo2 ?? null}
              noDeliveries={neverDelivered}
              assumption={assumption}
              partName={process?.requisition.partName ?? run.request.partId}
            />
          </Card>
          <Flex vertical gap={12} className="dash-side" style={{ minWidth: 0 }}>
            <Card
              className="dash-card"
              size="small"
              title={
                <>
                  Weights <InfoTip label="weights" title={WEIGHTS_TIP} />
                </>
              }
              extra={CRITERIA.some((c) => weights[c] !== defaultWeights[c]) ? <Tag style={{ marginInlineEnd: 0 }}>Changed</Tag> : undefined}
            >
              <WeightsPanel
                weights={weights}
                defaults={defaultWeights}
                onChange={changeWeights}
                sensitivity={weightsComplete ? sensitivity : []}
                supplierLabel={(id) => shortName(supplierNames[id] ?? id)}
              />
            </Card>
            <Card
              className="dash-card map-card"
              size="small"
              title={
                <>
                  Positioning: price vs CO₂ <InfoTip label="the positioning map" title={MAP_TIP} />
                </>
              }
            >
              <PositioningMap
                run={run}
                result={result}
                supplierNames={supplierNames}
                currentSupplierId={currentSupplierId}
                onSelectSupplier={openProfile}
              />
            </Card>
          </Flex>
        </div>
        {process.step === 2 && (
          <Flex justify="space-between" align="center" gap={8}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => goToStep(1)}>
              Back
            </Button>
            <Tooltip title={user.canDecide ? undefined : VIEW_ONLY_HINT}>
              <Button type="primary" disabled={!user.canDecide} icon={<ArrowRightOutlined />} iconPlacement="end" onClick={() => goToStep(3)}>
                Next: decide
              </Button>
            </Tooltip>
          </Flex>
        )}
      </Flex>
    ) : null;

  const processView =
    process && settings ? (
      <Flex vertical gap={12}>
        <ProcessSteps
          requisition={process.requisition}
          quantity={process.quantity}
          neededBy={process.neededBy}
          step={process.step}
          reached={process.reached}
          onStep={goToStep}
          canAdvance={
            process.step === 0
              ? user.canRun
              : process.step === 1
                ? activeSlot?.status === "completed" && !!activeSlot.run
                : process.step === 2
                  ? !!compareView && user.canDecide
                  : false
          }
          onAdvance={() => (process.step === 0 ? reviewForm.submit() : goToStep((process.step + 1) as ProcessStep))}
          onBackToQueue={() => {
            closePanels();
            setPage("queue");
          }}
        />
        {process.step === 0 && (
          <ReviewStep
            requisition={process.requisition}
            quantity={process.quantity}
            neededBy={process.neededBy}
            canRun={user.canRun}
            form={reviewForm}
            onNext={(quantity, neededBy) => {
              // A new quantity or date means a new evidence run; later steps start again.
              const changed = quantity !== process.quantity || neededBy !== process.neededBy || !process.run;
              const next: Process = changed
                ? { ...process, quantity, neededBy, step: 1, reached: 1, run: null }
                : { ...process, step: 1, reached: Math.max(process.reached, 1) as ProcessStep };
              if (changed) startRun(process.requisition.partId, quantity, neededBy);
              setProcesses((prev) => ({ ...prev, [process.requisition.recordId]: next }));
            }}
          />
        )}
        {process.step === 1 && (
          <CollectStep
            partId={process.requisition.partId}
            partName={process.requisition.partName}
            slot={activeSlot}
            favourites={favourites}
            savedRun={savedRuns.find((r) => r.request.partId === process.requisition.partId) ?? null}
            onUseSaved={useSavedFor}
            onRetry={() => startRun(process.requisition.partId, process.quantity, process.neededBy)}
            onShowMissing={() => openPanel("missing")}
            onBack={() => goToStep(0)}
            onNext={() => goToStep(2)}
          />
        )}
        {process.step === 2 &&
          (compareView ?? <Alert type="info" showIcon title="The evidence is not complete yet. Go back to step 2." />)}
        {process.step === 3 && run && result && (
          <DecideStep
            run={run}
            result={result}
            weights={appliedWeights}
            defaultWeights={defaultWeights}
            reference={benchmarks}
            supplierNames={supplierNames}
            currentSupplierId={currentSupplierId}
            co2PricePerTonneEur={settings.co2PricePerTonneEur}
            decidedBy={{ name: user.name, role: user.title }}
            requisitionId={process.requisition.recordId}
            progress={progress}
            canDecide={user.canDecide}
            onBack={() => goToStep(2)}
            onRecorded={recordDecision}
          />
        )}
        {process.step === 4 && process.record && (
          <CompleteStep
            record={process.record}
            supplierName={allNames[process.record.chosenSupplierId] ?? process.record.chosenSupplierId}
            partName={process.requisition.partName}
            onOpenDecision={() => openDecision(process.record!)}
            onBackToQueue={() => {
              closePanels();
              setPage("queue");
            }}
          />
        )}
      </Flex>
    ) : null;

  return (
    <ConfigProvider theme={theme}>
      <Layout style={{ minHeight: "100vh" }}>
        <AppHeader
          page={shownPage}
          onNavigate={(p) => {
            closePanels();
            if (p !== "suppliers") setOpenSupplierId(null);
            setPage(p);
          }}
          onHome={() => {
            closePanels();
            setOpenSupplierId(null);
            setPage(START_PAGE[user.role] as AppPage);
          }}
          processOpen={process !== null}
          decisionCount={log.length}
          onOpenDecisions={() => {
            setLogRecordId(null);
            openPanel("decisions");
          }}
          user={user}
          onSwitchUser={switchUser}
          onSignOut={() => setSignedOut(true)}
          onHelp={() => setHelp("how")}
          onAbout={() => setAboutOpen(true)}
          onGlossary={() => {
            closePanels();
            setPage("glossary");
          }}
          status={
            // Mode as a small status tag (16 Nov 2026, replaces the icon of 6 Nov 2026): readable without hovering and
            // not mistaken for help. A saved run is always spelled out, so nobody mistakes it for a live run.
            // Only live and saved runs get the tag; test and example mode are named in "About Fairweigh" (16 Nov 2026).
            shownMode &&
            (shownMode.kind === "live" || shownMode.kind === "saved") && (
              <Tooltip
                title={
                  <>
                    <div>Mode: {runModeLabel(shownMode)}</div>
                    {shownMode.kind === "live" && usage && (
                      <div>
                        Live runs today: {usage.liveRunsToday} of {usage.dailyLimit}
                      </div>
                    )}
                  </>
                }
              >
                <span tabIndex={0} aria-label={`Mode: ${runModeLabel(shownMode)}.`}>
                  <HeaderTag dot={shownMode.kind}>{runModeLabel(shownMode)}</HeaderTag>
                </span>
              </Tooltip>
            )
          }
        />

        <Layout.Content className="app-content">
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
          {notice && (
            <Alert type="success" showIcon closable onClose={() => setNotice(null)} title={notice} style={{ marginBottom: 12 }} />
          )}

          {signedOut ? (
            <SignedOut onSignIn={switchUser} />
          ) : shownPage === "impact" ? (
            settings && (
              <ResultsPage
                settings={settings}
                log={log}
                supplierNames={{ ...allNames, ...supplierNames }}
                onOpenDecision={openDecision}
                onOpenSupplier={setInfoSupplierId}
              />
            )
          ) : shownPage === "rules" ? (
            settings && rules && <RulesPage rules={rules} user={user} onSaved={setRules} />
          ) : shownPage === "sustainability" ? (
            settings && <SustainabilityPage settings={settings} />
          ) : shownPage === "targets" ? (
            settings && rules && (
              <TargetsPage rules={rules} inputs={targetInputs} buyers={settings.buyers ?? []} user={user} onSaved={setRules} />
            )
          ) : shownPage === "dashboard" ? (
            settings &&
            overview && <CpoDashboard settings={settings} orders={orders} log={log} overview={overview} onOpenSupplier={openSupplierPage} />
          ) : shownPage === "glossary" ? (
            <GlossaryPage rules={rules} />
          ) : shownPage === "suppliers" ? (
            <SuppliersPage
              key={openSupplierId ?? "list"}
              user={user}
              inCurrentRun={run && result && process ? run.request.supplierIds : []}
              onOpenInCockpit={(id) => {
                if (!process) return;
                goToStep(2);
                setPage("process");
                openProfile(id);
              }}
              favourites={favourites}
              onToggleFavourite={toggleFavourite}
              decisions={log}
              partNames={partNames}
              onOpenDecision={openDecision}
              openSupplierId={openSupplierId}
            />
          ) : shownPage === "process" ? (
            processView
          ) : (
            <WorkQueuePage
              queue={queue}
              progress={orders.length > 0 ? progress : null}
              supplierNames={allNames}
              onStart={(e) => startProcess(e.requisition)}
              onResume={resumeProcess}
              onOpenDecision={openDecision}
              canRun={user.canRun}
              userName={user.name}
            />
          )}
        </Layout.Content>
        {/* All data is fictitious (CLAUDE.md); since 16 Nov 2026 this is said in "About Fairweigh", not on every screen. */}
        <AboutDialog
          open={aboutOpen}
          onClose={() => setAboutOpen(false)}
          mode={shownMode}
          usage={usage}
          aiService={aiService(shownMode)}
        />

        <ScoreHelp
          open={help !== null}
          title={help === "score" ? "How is the score calculated?" : "How it works"}
          onClose={() => setHelp(null)}
          rules={rules}
          weights={shownPage === "process" && result ? appliedWeights : null}
          defaults={shownPage === "process" && result ? defaultWeights : null}
        />
        <SupplierProfile
          supplierId={profileId}
          run={run}
          settings={settings}
          result={result}
          weights={appliedWeights}
          supplierNames={supplierNames}
          onClose={() => setProfileId(null)}
          favourites={favourites}
          onToggleFavourite={toggleFavourite}
          decisions={log}
          partNames={partNames}
          onOpenDecision={openDecision}
        />
        <SupplierInfoPanel
          supplierId={infoSupplierId}
          onClose={() => setInfoSupplierId(null)}
          user={user}
          favourites={favourites}
          onToggleFavourite={toggleFavourite}
          decisions={log}
          partNames={partNames}
          onOpenDecision={(record) => {
            setInfoSupplierId(null);
            openDecision(record);
          }}
        />
        <EvidenceDrawer
          evidence={selected}
          partId={run?.request.partId ?? ""}
          supplierName={selected ? (supplierNames[selected.supplierId] ?? selected.supplierId) : ""}
          onClose={() => setSelected(null)}
        />
        <SidePanel
          open={panel !== null}
          contentKey={panel}
          onClose={() => setPanel(null)}
          size={panel === "evidence" ? 980 : 760}
          title={
            panel === "why" ? (
              "Why this recommendation?"
            ) : panel === "evidence"
              ? `All evidence (${run?.evidence.length ?? 0}) and gaps (${run?.gaps.length ?? 0})`
              : panel === "missing"
                ? "What's missing to decide"
                : panel === "decisions"
                  ? `Decision log (${log.length})`
                  : `Agent log (${run?.steps.length ?? 0} steps)`
          }
        >
          {run && result && panel === "why" && (
            <RecommendationDetails
              run={run}
              result={result}
              supplierNames={supplierNames}
              currentSupplierId={currentSupplierId}
              co2PricePerTonneEur={settings?.co2PricePerTonneEur ?? 0}
              co2PriceToConfirm={settings?.co2PriceToConfirm ?? true}
              nearestFlip={nearestFlip(sensitivity)}
              onOpenSupplier={openProfile}
              onExplainScore={() => setHelp("score")}
              weights={appliedWeights}
              industryCo2={catalogPart?.industryCo2 ?? null}
              requestLabel={`${catalogPart?.partName ?? run.request.partId} · ${run.request.quantity.toLocaleString("en-GB")} pcs${run.request.neededBy ? ` · needed by ${formatDay(run.request.neededBy)}` : ""}`}
            />
          )}
          {run && panel === "evidence" && (
            <EvidenceTable run={run} supplierNames={supplierNames} selectedId={null} onOpen={openEvidence} />
          )}
          {run && result && panel === "missing" && (
            <MissingData
              partName={catalogPart?.partName ?? run.request.partId}
              run={run}
              result={result}
              supplierNames={supplierNames}
              requirements={Object.fromEntries(
                run.request.supplierIds.map((id) => [id, scoredInput ? whatItTakesToLead(scoredInput, appliedWeights, id, benchmarks) : null]),
              )}
            />
          )}
          {panel === "decisions" && (
            <DecisionLog
              key={logRecordId ?? "all"}
              records={log}
              supplierNames={{ ...allNames, ...supplierNames }}
              partNames={partNames}
              storageAvailable={storageAvailable}
              openRecordId={logRecordId}
              onOpenSupplier={openSupplierPage}
            />
          )}
          {run && panel === "log" && (
            <ol style={{ margin: 0, paddingLeft: 28, lineHeight: 1.8 }}>
              {run.steps.map((s) => (
                <li key={s.index}>{s.summary}</li>
              ))}
            </ol>
          )}
        </SidePanel>
      </Layout>
    </ConfigProvider>
  );
}
