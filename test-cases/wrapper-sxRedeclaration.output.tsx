// Sx-aware wrappers must not redeclare a local sx variable after destructuring an incoming sx prop.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { SxAwareButton } from "./lib/sx-aware-component";

type ExpandableButtonProps = React.PropsWithChildren<{
  expanded?: boolean;
  disabled?: boolean;
  sx?: stylex.StyleXStyles;
}> &
  React.ComponentPropsWithRef<typeof SxAwareButton>;

function ExpandableButton(props: ExpandableButtonProps) {
  const { children, sx, expanded, ...rest } = props;
  return (
    <SxAwareButton
      {...rest}
      sx={[
        callerStyles.expandableButton,
        expanded ? callerStyles.expandableButtonExpanded : null,
        sx,
      ]}
    >
      {children}
    </SxAwareButton>
  );
}

const callerStyles = stylex.create({
  caller: {
    color: "#1d4ed8",
  },
  expandableButton: {
    minHeight: 32,
    paddingBlock: "4px",
    paddingInline: "8px",
    backgroundColor: "#f8fafc",
  },
  expandableButtonExpanded: {
    paddingBlock: "8px",
    paddingInline: "12px",
  },
});

export const App = () => (
  <div style={{ padding: 12 }}>
    <ExpandableButton expanded sx={callerStyles.caller}>
      Expanded
    </ExpandableButton>
  </div>
);
