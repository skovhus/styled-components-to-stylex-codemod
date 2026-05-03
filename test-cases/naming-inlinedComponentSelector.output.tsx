// Component used as selector in css helper should not lose its name after inlining
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div sx={[styles.container, stylex.defaultMarker()]}>
      <svg viewBox="0 0 100 100">
        <path
          d="M10 80 Q 52.5 10, 95 80"
          sx={[styles.gradientPath, styles.gradientPathIncontainerAnimation]}
        />
        <g sx={[styles.filteredGroup, styles.filteredGroupIncontainerAnimation]}>
          <rect x="10" y="10" width="80" height="80" fill="#6a7ab5" />
        </g>
      </svg>
    </div>
  );
}

const styles = stylex.create({
  gradientPath: {
    fill: "url(#gradient)",
    opacity: 0,
    transition: "opacity 0.3s",
  },
  filteredGroup: {
    filter: "url(#blur)",
    transform: "scale(1)",
    transition: "transform 0.3s",
  },
  container: {
    padding: 16,
    backgroundColor: "#f0f5ff",
  },
  gradientPathIncontainerAnimation: {
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover")]: 1,
    },
  },
  filteredGroupIncontainerAnimation: {
    transform: {
      default: "scale(1)",
      [stylex.when.ancestor(":hover")]: "scale(1.1)",
    },
  },
});
