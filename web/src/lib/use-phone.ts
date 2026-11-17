"use client";

import { Grid } from "antd";

/**
 * True on phones (below 768 px), where wide tables become cards (10 Nov 2026).
 * Before the first measurement it is false, so the server render shows the desktop layout.
 */
export function useIsPhone(): boolean {
  const screens = Grid.useBreakpoint();
  return screens.md === false;
}

/**
 * True below 992 px (phones and tablets). The offer table in the compare step has eight columns and only fits
 * from laptop width on, so tablets get the offer cards too (review 16 Nov 2026).
 */
export function useIsBelowLaptop(): boolean {
  const screens = Grid.useBreakpoint();
  return screens.lg === false;
}
