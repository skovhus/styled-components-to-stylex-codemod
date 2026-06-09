import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $zIndex } from "./tokens.stylex";

type FocusableCellProps = React.PropsWithChildren<{
  isAnimating?: boolean;
}>;

function FocusableCell(props: FocusableCellProps) {
  const { children, isAnimating } = props;
  return (
    <div sx={[styles.focusableCell, isAnimating && styles.focusableCellAnimating]}>{children}</div>
  );
}

export const App = () => (
  <div style={{ display: "grid", gap: 12 }}>
    <div data-label=" after" sx={styles.thing}>
      Hover me!
    </div>
    <FocusableCell isAnimating>
      <button type="button">Focusable cell</button>
    </FocusableCell>
    <button type="button" sx={styles.logoButton}>
      Logo button
    </button>
    <button type="button" sx={styles.responsiveLogoButton}>
      Responsive logo button
    </button>
    <button type="button" sx={styles.mediaLogoButton}>
      Media logo button
    </button>
    <button type="button" sx={styles.compactLogoButton}>
      Compact logo button
    </button>
    <button type="button" sx={styles.compactMediaLogoButton}>
      Compact media logo button
    </button>
    <button type="button" sx={styles.orderedLogoButton}>
      Ordered logo button
    </button>
    <button type="button" sx={styles.orderedMediaLogoButton}>
      Ordered media logo button
    </button>
    <button type="button" sx={styles.nestedLogoButton}>
      Nested logo button
    </button>
    <button type="button" sx={styles.functionalNestedLogoButton}>
      Functional nested logo button
    </button>
    <button type="button" sx={styles.multilineBeforeLogoButton}>
      Multiline before logo button
    </button>
    <button type="button" sx={styles.multilineSelectorListLogoButton}>
      Multiline selector list logo button
    </button>
  </div>
);

const styles = stylex.create({
  thing: {
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: "hotpink",
    color: {
      default: "blue",
      ":hover": "red",
    },
    outline: {
      default: null,
      ":focus": "2px solid blue",
    },
    "::before": {
      content: '"🔥"',
    },
    "::after": {
      content: "attr(data-label)",
    },
  },
  focusableCell: {
    position: "relative",
    zIndex: {
      default: null,
      ":focus-within": `calc(${$zIndex.modal} + 2)`,
    },
  },
  focusableCellAnimating: {
    zIndex: $zIndex.modal,
  },
  logoButton: {
    borderWidth: 0,
    backgroundColor: "transparent",
    padding: 8,
    outlineWidth: {
      default: null,
      ":focus-visible": "2px",
    },
    outlineStyle: {
      default: null,
      ":focus-visible": "solid",
    },
    outlineColor: {
      default: null,
      ":focus-visible": "#4f46e5",
    },
  },
  responsiveLogoButton: {
    borderWidth: 0,
    backgroundColor: "white",
    padding: 8,
    outlineWidth: {
      default: null,
      ":focus-visible": {
        default: null,
        "@media (prefers-reduced-motion: no-preference)": "2px",
      },
    },
    outlineStyle: {
      default: null,
      ":focus-visible": {
        default: null,
        "@media (prefers-reduced-motion: no-preference)": "solid",
      },
    },
    outlineColor: {
      default: null,
      ":focus-visible": {
        default: null,
        "@media (prefers-reduced-motion: no-preference)": "#4f46e5",
      },
    },
  },
  mediaLogoButton: {
    borderWidth: 0,
    backgroundColor: "#f8fafc",
    padding: 8,
    outlineWidth: {
      default: null,
      "@media (hover: hover)": "2px",
    },
    outlineStyle: {
      default: null,
      "@media (hover: hover)": "solid",
    },
    outlineColor: {
      default: null,
      "@media (hover: hover)": "#4f46e5",
    },
  },
  compactLogoButton: {
    borderWidth: 0,
    backgroundColor: {
      default: "#f1f5f9",
      ":focus-visible": "#dcfce7",
    },
    padding: 8,
    outlineWidth: {
      default: null,
      ":focus-visible": "2px",
    },
    outlineStyle: {
      default: null,
      ":focus-visible": "solid",
    },
    outlineColor: {
      default: null,
      ":focus-visible": "#4f46e5",
    },
  },
  compactMediaLogoButton: {
    borderWidth: 0,
    backgroundColor: "#e2e8f0",
    padding: 8,
    color: {
      default: null,
      "@media (hover: hover)": "#1d4ed8",
    },
    outlineWidth: {
      default: null,
      "@media (hover: hover)": "2px",
    },
    outlineStyle: {
      default: null,
      "@media (hover: hover)": "solid",
    },
    outlineColor: {
      default: null,
      "@media (hover: hover)": "#4f46e5",
    },
  },
  orderedLogoButton: {
    borderWidth: 0,
    backgroundColor: "#fff7ed",
    padding: 8,
    outlineWidth: {
      default: null,
      ":focus-visible": "2px",
    },
    outlineStyle: {
      default: null,
      ":focus-visible": "solid",
    },
    outlineColor: {
      default: null,
      ":focus-visible": "#dc2626",
    },
  },
  orderedMediaLogoButton: {
    borderWidth: 0,
    backgroundColor: "#ecfdf5",
    padding: 8,
    outlineWidth: {
      default: null,
      "@media (hover: hover)": "2px",
    },
    outlineStyle: {
      default: null,
      "@media (hover: hover)": "solid",
    },
    outlineColor: {
      default: null,
      "@media (hover: hover)": "#047857",
    },
  },
  nestedLogoButton: {
    borderWidth: 0,
    backgroundColor: "#f8fafc",
    padding: 8,
    outlineWidth: {
      default: null,
      ":hover:focus-visible": "2px",
    },
    outlineStyle: {
      default: null,
      ":hover:focus-visible": "solid",
    },
    outlineColor: {
      default: null,
      ":hover:focus-visible": "#4f46e5",
    },
  },
  functionalNestedLogoButton: {
    borderWidth: 0,
    backgroundColor: "#fdf4ff",
    padding: 8,
    outlineWidth: {
      default: null,
      ":is(:hover, :focus):active": "2px",
    },
    outlineStyle: {
      default: null,
      ":is(:hover, :focus):active": "solid",
    },
    outlineColor: {
      default: null,
      ":is(:hover, :focus):active": "#4f46e5",
    },
  },
  multilineBeforeLogoButton: {
    borderWidth: 0,
    backgroundColor: "#f0fdfa",
    padding: 8,
    outlineColor: {
      default: null,
      ":focus-visible": "#4f46e5",
    },
    outlineWidth: {
      default: null,
      ":focus-visible": "2px",
    },
    outlineStyle: {
      default: null,
      ":focus-visible": "solid",
    },
  },
  multilineSelectorListLogoButton: {
    borderWidth: 0,
    backgroundColor: "#faf5ff",
    padding: 8,
    outlineWidth: {
      default: null,
      ":hover": "2px",
      ":focus-visible": "2px",
    },
    outlineStyle: {
      default: null,
      ":hover": "solid",
      ":focus-visible": "solid",
    },
    outlineColor: {
      default: null,
      ":hover": "#4f46e5",
      ":focus-visible": "#4f46e5",
    },
  },
});
