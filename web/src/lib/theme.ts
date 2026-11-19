import type { ThemeConfig } from "antd";

/**
 * Brand tokens (16 Nov 2026), the same values as the CSS variables at the top of globals.css.
 * Main colour: dark petrol green. Green, yellow and red stay reserved for status (PLAN.md, section 2),
 * so the accent is a blue-green that differs clearly from the status green of "Verified".
 * Surfaces follow a calm admin style: light grey page, white cards.
 */
export const BRAND = {
  primary: "#0f5c5c",
  /** Hover and pressed states get darker, never lighter, so the change is clearly visible. */
  primaryHover: "#0a4646",
  primaryActive: "#073535",
  secondary: "#00918a",
  /** Light petrol for hover on clickable rows and values; the stronger one marks a selection. */
  tint: "#eaf3f3",
  tintStrong: "#d5e8e8",
  text: "#303030",
  textSecondary: "#616161",
  textTertiary: "#8c8c8c",
  border: "#e3e3e3",
  borderStrong: "#d9d9d9",
  surfaceMuted: "#f5f5f5",
  page: "#f1f2f4",
  white: "#ffffff",
  /** Charts follow the pitch design v4 (review 16 Nov 2026): one highlight in accent teal (secondary),
   *  everything else light teal. No amber or blue in charts: amber means "warning". */
  chartLight: "#b8d3d0",
  /** Light teal for text and links on dark surfaces (petrol header, dark tooltips), as in the logo. */
  onDark: "#7fc8be",
} as const;

export const PRIMARY = BRAND.primary;

/** Form fields and filters: border with 3:1 contrast (WCAG 1.4.11), so they read as controls. */
const FIELD_BORDER = BRAND.textTertiary;

export const theme: ThemeConfig = {
  token: {
    colorPrimary: BRAND.primary,
    colorPrimaryHover: BRAND.primaryHover,
    colorPrimaryActive: BRAND.primaryActive,
    colorInfo: BRAND.primary,
    colorLink: BRAND.primary,
    colorLinkHover: BRAND.primaryHover,
    colorLinkActive: BRAND.primaryActive,
    linkHoverDecoration: "underline",
    colorBgLayout: BRAND.page,
    colorText: BRAND.text,
    colorTextSecondary: BRAND.textSecondary,
    colorBorderSecondary: BRAND.border,
    // Hover and selection in menus, dropdowns and text buttons: light petrol instead of grey (16 Nov 2026).
    controlItemBgHover: BRAND.tint,
    controlItemBgActive: BRAND.tintStrong,
    controlItemBgActiveHover: BRAND.tintStrong,
    colorBgTextHover: BRAND.tint,
    colorBgTextActive: BRAND.tintStrong,
    // Empty filters must not look disabled (16 Nov 2026): placeholder text at WCAG AA contrast (#6b6b6b on white, 5.3:1)
    // and the dropdown arrow and clear icon darker than antd's default.
    colorTextPlaceholder: "#6b6b6b",
    colorTextQuaternary: "#7a7a7a",
    borderRadius: 8,
    borderRadiusLG: 12,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  components: {
    Button: {
      // Secondary buttons: petrol border and text on a light petrol background; primary ones get darker.
      defaultHoverBorderColor: BRAND.primary,
      defaultHoverColor: BRAND.primary,
      defaultHoverBg: BRAND.tint,
      defaultActiveBorderColor: BRAND.primaryActive,
      defaultActiveColor: BRAND.primaryActive,
      defaultActiveBg: BRAND.tintStrong,
      textHoverBg: BRAND.tint,
      primaryShadow: "none",
      defaultShadow: "none",
    },
    Card: { headerFontSize: 14, headerHeightSM: 40 },
    // More room around the text of hover tooltips (feedback 17 Nov 2026).
    // antd: vertical padding = paddingSM / 2, horizontal = paddingXS, so 10 px × 14 px instead of 6 × 8.
    Tooltip: { paddingSM: 20, paddingXS: 14 },
    // Rows only react when they can be clicked (class "table-clickable" or "row-clickable" in globals.css).
    Table: {
      headerBg: "#fafafa",
      headerColor: BRAND.textSecondary,
      cellPaddingBlockSM: 6,
      rowHoverBg: "transparent",
      rowSelectedBg: BRAND.tintStrong,
      rowSelectedHoverBg: BRAND.tintStrong,
      // Every table sits in a card that rounds and clips the corners (20 Nov 2026), so the header stays square.
      headerBorderRadius: 0,
    },
    Select: { colorBorder: FIELD_BORDER },
    Input: { colorBorder: FIELD_BORDER },
    InputNumber: { colorBorder: FIELD_BORDER },
    DatePicker: { colorBorder: FIELD_BORDER },
    Checkbox: { colorBorder: FIELD_BORDER },
  },
};
