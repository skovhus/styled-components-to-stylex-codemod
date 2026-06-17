import { css, type DefaultTheme } from "styled-components";
import type { ThemeColor } from "../tokens.stylex";

interface ThemedStyledProps {
  theme: DefaultTheme;
}

// CSS helper export for testing imported css`` mixins.
// The adapter resolves this to helpers.truncate from helpers.stylex.
export const TruncateText = css`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

// Theme accessor helper - returns a function that extracts a color from the theme
export const color =
  (colorName: ThemeColor) =>
  (props: ThemedStyledProps): string =>
    props.theme.color[colorName];

export const runtimeColor = (): string => "#2d3748";

export const paletteColor = (colorName: ThemeColor): string => {
  const colors: Record<ThemeColor, string> = {
    accent: "#8B5CF6",
    bgBase: "#990000",
    bgBaseHover: "#BAE6FD",
    bgBorderFaint: "#7DD3FC",
    bgBorderSolid: "#94A3B8",
    bgFocus: "#60A5FA",
    bgSelected: "#3B82F6",
    bgSub: "#009900",
    controlPrimary: "#3B82F6",
    controlPrimaryHover: "#2563EB",
    greenBase: "#22C55E",
    labelBase: "#111827",
    labelFaint: "#9CA3AF",
    labelMuted: "#6B7280",
    labelTitle: "#111827",
    primaryColor: "#BF4F74",
    textPrimary: "#111827",
    textSecondary: "#6B7280",
  };
  return colors[colorName];
};

export function mixedColor(
  colorName: ThemeColor,
  mode: "theme",
): (props: ThemedStyledProps) => string;
export function mixedColor(colorName: ThemeColor): string;
export function mixedColor(
  colorName: ThemeColor,
  mode?: "theme",
): string | ((props: ThemedStyledProps) => string) {
  if (mode === "theme") {
    return (props: ThemedStyledProps) => props.theme.color[colorName];
  }
  return colorName === "bgSub" ? "#009900" : "#990000";
}

// CSS snippet helper - returns a CSS string for text truncation
export const truncate = () => `
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

// Another CSS snippet helper - flexible centering
export const flexCenter = () => `
  display: flex;
  align-items: center;
  justify-content: center;
`;

// Gradient helper - returns a CSS string for gradient text
export const gradient = () => `
  background-image: linear-gradient(90deg, #ff6b6b, #5f6cff);
  color: transparent;
`;

export const focusOutline = css`
  outline: 2px solid #4f46e5;
`;

// Thin pixel helper - returns a CSS string for a thin pixel
export const thinPixel = () => {
  // This would do some runtime lookup, etc.
  return "0.5px";
};

// Multi-line truncation helper - returns a CSS string for webkit line clamping
export const truncateMultiline = (lines: number) => `
  display: -webkit-box;
  -webkit-line-clamp: ${lines};
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

type Speed = "normal" | "slow" | "fast";

export const transitionSpeed = (speed: Speed) => `var(--speed-${speed})`;

export const zIndex = {
  modal: 1000,
  popover: 900,
  dialog: 800,
};

export const config = {
  ui: {
    spacing: {
      small: "4px",
      medium: "8px",
      large: "16px",
    },
  },
};

// Font weight helper - returns numeric font weights
export const fontWeight = (weight: "normal" | "medium" | "bold") => {
  const weights = { normal: 400, medium: 500, bold: 600 };
  return weights[weight];
};

// Font size helper - returns size strings
export const fontSize = (size: "small" | "medium" | "large") => {
  const sizes = { small: "12px", medium: "14px", large: "16px" };
  return sizes[size];
};

const maxWidthQuery = (maxWidth: number) => `@media (max-width: ${maxWidth}px)`;

/**
 * Media queries for different screens sizes.
 */
export const screenSize = {
  /** Media query to target only phones-sized screens. */
  phone: maxWidthQuery(640),
  /** Media query to target only tablet-sized screens and lower. */
  tablet: maxWidthQuery(768),
};

/**
 * Raw breakpoint pixel values for use inside custom media query templates.
 */
export const screenSizeBreakPoints = {
  phone: 640,
  tablet: 768,
};

/**
 * A helper function that returns a curried function that returns a CSS string for a themed border.
 */
export function themedBorder(colorKey: ThemeColor) {
  return (props: ThemedStyledProps) => `${thinPixel()} solid ${props.theme.color[colorKey]}`;
}

/**
 * A helper function that returns a CSS border shorthand with thin pixel width.
 */
export function thinBorder(color: string) {
  return `${thinPixel()} solid ${color}`;
}

/**
 * A helper function that returns a CSS string for a border with a given color.
 */
export function borderByColor(color: string) {
  return `1px solid ${color}`;
}

/**
 * Color utility with member expression methods.
 * E.g. ColorConverter.cssWithAlpha(color, alpha) returns a CSS color-mix string.
 */
export const ColorConverter = {
  cssWithAlpha(color: string, alpha: number): string {
    if (!color.startsWith("#")) {
      return color;
    }
    const raw = color.slice(1);
    const normalized =
      raw.length === 3
        ? raw
            .split("")
            .map((ch) => ch + ch)
            .join("")
        : raw;
    if (normalized.length !== 6) {
      return color;
    }
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    const a = Math.min(1, Math.max(0, alpha));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  },
};

/**
 * Returns a highlight background color based on the dark mode flag.
 * Used to test preserveRuntimeCall with theme boolean arguments.
 */
export function getRowHighlightColor(isDark: boolean): string {
  return isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)";
}

/**
 * Component wrapper helper - wraps a component for testing styled(wrapper(Component)) patterns
 */
export function wrapComponent<P extends object>(
  Component: React.ComponentType<P>,
): React.ComponentType<P> {
  return Component;
}

/**
 * Browser detection helpers - used for browser-specific styling
 */
export const Browser = {
  isSafari:
    typeof navigator !== "undefined" && /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
  isTouchDevice:
    typeof window !== "undefined" &&
    "ontouchstart" in window &&
    !window.matchMedia("(hover: hover)").matches,
};

/**
 * Pseudo-class highlight helper: picks "hover" or "active" based on device capability.
 * On touch devices we use :active for immediate feedback; on pointer devices, :hover.
 *
 * Defined as a function so styled-components re-evaluates it on each render,
 * picking up the current `Browser.isTouchDevice` value set by `TouchDeviceToggle`.
 */
export const highlight = () => (Browser.isTouchDevice ? "active" : "hover");

/**
 * Pseudo-class highlight expand helper: same semantics as `highlight`,
 * but the codemod resolves it to a `pseudoExpand` — one merged style object
 * with :active direct and :hover wrapped in a `canHover` media condition.
 */
export const highlightExpand = () => (Browser.isTouchDevice ? "active" : "hover");

/**
 * Helper that wraps the conditional pseudo selection in a function call,
 * making the pairing explicit and enabling lint enforcement.
 */
export function highlightStyles<TActive, THover>(variants: {
  active: TActive;
  hover: THover;
}): TActive | THover {
  return Browser.isTouchDevice ? variants.active : variants.hover;
}

/**
 * Scroll fade mask helper - returns a css`` RuleSet for scroll fade effects.
 * This demonstrates the bug where css`` helper return values are passed directly to stylex.props().
 */
export const scrollFadeMaskStyles = (size: number, direction?: "top" | "bottom" | "both") => css`
  --fade-size: ${size}px;
  mask-image: linear-gradient(
    to bottom,
    ${direction === "top" || direction === "both" ? "transparent, black var(--fade-size)," : ""}
      black,
    ${
      direction === "bottom" || direction === "both"
        ? "black calc(100% - var(--fade-size)), transparent"
        : ""
    }
  );
`;

// Draggable region helper — returns a css`` RuleSet that applies electron draggable region styles.
// The adapter resolves this to a CSS module className instead of a StyleX expression.
export const draggableRegion = (_enable: boolean) => css`
  -webkit-app-region: drag;
  & > * {
    -webkit-app-region: no-drag;
  }
`;

// Shadow helper — returns a box-shadow CSS string for a given level.
// Used to test adapter resolution for dynamic prop args.
export const shadow = (level: string): string => {
  const shadows: Record<string, string> = {
    dark: "0 4px 12px rgba(0,0,0,0.3)",
    light: "0 2px 4px rgba(0,0,0,0.1)",
  };
  return shadows[level] ?? "none";
};

export const glowShadow = (level: string): string =>
  level === "dark" ? "0 0 16px rgba(0,0,0,0.45)" : "0 0 16px rgba(255,255,255,0.45)";

// Plain numeric constant from a non-`.stylex` module. The StyleX compiler
// cannot resolve imported values inside `stylex.create()`, so the codemod bails
// (rather than inlining) and asks the user to relocate it into a `.stylex`
// defineConsts group. The fixture adapter returns `undefined` for it.
export const COLUMN_WIDTH = 320;
