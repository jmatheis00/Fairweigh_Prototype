import { BRAND } from "@/lib/theme";

/**
 * Logo: the Fairweigh scale (16 Nov 2026, replaces the shopping cart of 6 Nov 2026). A level beam on a pivot with
 * price on the left and CO₂ on the right: both in balance. Same drawing as public/logo.svg and app/icon.svg, taken
 * from the pitch design template v4. On the petrol header: white beam and price circle, light teal CO₂ circle.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" style={{ flex: "none" }}>
      <path d="M16 16.1 L20.6 24.1 H11.4 Z" fill="currentColor" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />
      <path d="M3.6 16.1 H28.4" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
      <circle cx="5.2" cy="10.7" r="3.4" fill="currentColor" />
      <circle cx="26.8" cy="10.7" r="3.4" fill={BRAND.onDark} />
    </svg>
  );
}
