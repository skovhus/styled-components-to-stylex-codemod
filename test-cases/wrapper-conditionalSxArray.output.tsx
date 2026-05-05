import * as React from "react";

// Optional style composition for sx-aware wrappers must stay flat and omit undefined entries.
import * as stylex from "@stylexjs/stylex";
import { SxAwareButton } from "./lib/sx-aware-component";

type CompactButtonProps = { compact?: boolean } & Omit<
  React.ComponentPropsWithRef<typeof SxAwareButton>,
  "className" | "style"
>;

function CompactButton(props: CompactButtonProps) {
  const { children, sx, compact, ...rest } = props;
  return (
    <SxAwareButton
      {...rest}
      sx={[callerStyles.compactButton, compact ? callerStyles.compactButtonCompact : null, sx]}
    >
      {children}
    </SxAwareButton>
  );
}

const callerStyles = stylex.create({
  caller: {
    textDecorationLine: "underline",
  },
  compactButton: {
    color: "#0f172a",
    backgroundColor: "#e2e8f0",
  },
  compactButtonCompact: {
    padding: 2,
  },
});

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 12 }}>
    <CompactButton>Default</CompactButton>
    <CompactButton compact sx={callerStyles.caller}>
      Compact
    </CompactButton>
  </div>
);
