import * as React from "react";

// Optional style composition for sx-aware wrappers must stay flat and omit undefined entries.
import * as stylex from "@stylexjs/stylex";
import { SxAwareButton } from "./lib/sx-aware-component";

type CompactButtonProps = {
  compact?: boolean;
  width?: number;
} & Omit<React.ComponentPropsWithRef<typeof SxAwareButton>, "className" | "style">;

function CompactButton(props: CompactButtonProps) {
  const { sx, compact, width, ...rest } = props;
  return (
    <SxAwareButton
      {...rest}
      sx={[
        callerStyles.compactButton(width ?? 120),
        compact ? callerStyles.compactButtonCompact : null,
        sx,
      ]}
    />
  );
}

const callerStyles = stylex.create({
  caller: {
    textDecorationLine: "underline",
  },
  compactButton: (width: number) => ({
    color: "#0f172a",
    width,
  }),
  compactButtonCompact: {
    fontWeight: "bold",
  },
});

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 12 }}>
    <CompactButton>Default</CompactButton>
    <CompactButton compact width={96} sx={callerStyles.caller}>
      Compact
    </CompactButton>
  </div>
);
