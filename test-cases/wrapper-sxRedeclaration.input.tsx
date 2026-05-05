// Sx-aware wrappers must not redeclare a local sx variable after destructuring an incoming sx prop.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";
import { SxAwareButton } from "./lib/sx-aware-component";

type ExpandableButtonProps = React.PropsWithChildren<{
  $expanded?: boolean;
  disabled?: boolean;
  sx?: stylex.StyleXStyles;
}>;

const ExpandableButton = styled(SxAwareButton)<ExpandableButtonProps>`
  min-height: 32px;
  padding: ${(props) => (props.$expanded ? "8px 12px" : "4px 8px")};
  background-color: #f8fafc;
`;

const callerStyles = stylex.create({
  caller: {
    color: "#1d4ed8",
  },
});

export const App = () => (
  <div style={{ padding: 12 }}>
    <ExpandableButton $expanded sx={callerStyles.caller}>
      Expanded
    </ExpandableButton>
  </div>
);
