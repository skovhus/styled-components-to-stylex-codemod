import React from "react";
import { Browser } from "./helpers";

/**
 * Renders `children` twice — once with `Browser.isTouchDevice = false` (pointer/hover)
 * and once with `Browser.isTouchDevice = true` (touch/active) — so both code paths
 * are visible in Storybook side-by-side.
 */
export function TouchDeviceToggle({ children }: { children: (touch: boolean) => React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <div>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Pointer (hover)</div>
        <div style={{ display: "flex", gap: 16 }}>
          <TouchMode touch={false}>{children}</TouchMode>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Touch (active)</div>
        <div style={{ display: "flex", gap: 16 }}>
          <TouchMode touch={true}>{children}</TouchMode>
        </div>
      </div>
    </div>
  );
}

/**
 * Sets `Browser.isTouchDevice` before rendering children.
 * Uses a render function so child components read the value during their render.
 */
function TouchMode({
  touch,
  children,
}: {
  touch: boolean;
  children: (touch: boolean) => React.ReactNode;
}) {
  Browser.isTouchDevice = touch;
  return <>{children(touch)}</>;
}
