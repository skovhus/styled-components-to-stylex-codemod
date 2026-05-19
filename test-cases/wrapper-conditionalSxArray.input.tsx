// Optional style composition for sx-aware wrappers must stay flat and omit undefined entries.
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";
import { SxAwareButton } from "./lib/sx-aware-component";

const CompactButton = styled(SxAwareButton)<{ $compact?: boolean; $width?: number }>`
  color: #0f172a;
  width: ${(props) => props.$width ?? 120}px;

  ${(props) =>
    props.$compact
      ? `
          font-weight: bold;
        `
      : ""}
`;

const callerStyles = stylex.create({
  caller: {
    textDecorationLine: "underline",
  },
});

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 12 }}>
    <CompactButton>Default</CompactButton>
    <CompactButton $compact $width={96} sx={callerStyles.caller}>
      Compact
    </CompactButton>
  </div>
);
