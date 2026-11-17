"use client";

import { useEffect, useState } from "react";
import type { CertificateRecord, CompanyEmissionsRecord, RatingHistoryEntry, RiskAlert, SupplierPerformanceMonth } from "@scc/shared";
import { api } from "./api";

/** Data around the suppliers from the connected systems: ERP history, rating partner, risk monitoring. */
export interface PartnerData {
  performance: SupplierPerformanceMonth[];
  ratingHistory: RatingHistoryEntry[];
  certificates: CertificateRecord[];
  emissions: CompanyEmissionsRecord[];
  alerts: RiskAlert[];
}

let cache: Promise<PartnerData> | null = null;

/** Loads once per page view; every component that needs it shares the same request. */
export function loadPartnerData(): Promise<PartnerData> {
  cache ??= Promise.all([api.supplierPerformance(), api.ratingHistory(), api.certificates(), api.companyEmissions(), api.riskAlerts()])
    .then(([performance, ratingHistory, certificates, emissions, alerts]) => ({ performance, ratingHistory, certificates, emissions, alerts }))
    .catch((e: unknown) => {
      cache = null;
      throw e;
    });
  return cache;
}

export function usePartnerData(): { data: PartnerData | null; error: string | null } {
  const [data, setData] = useState<PartnerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    loadPartnerData()
      .then((d) => active && setData(d))
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
  }, []);
  return { data, error };
}
