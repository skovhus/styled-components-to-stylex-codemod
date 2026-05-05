import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { SxAwareButton } from "./lib/sx-aware-component";

type ExpandableButtonProps = Omit<
  React.ComponentPropsWithRef<typeof SxAwareButton>,
  "className" | "style"
> & {
  expanded?: boolean;
};

function ExpandableButton(props: ExpandableButtonProps) {
  const { children, expanded, sx: forwardedSx, ...rest } = props;
  return (
    <SxAwareButton
      {...rest}
      sx={[
        styles.expandableButton,
        expanded ? styles.expandableButtonExpanded : styles.expandableButtonNotExpanded,
        forwardedSx,
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
});

export const App = () => (
  <div style={{ padding: 12 }}>
    <ExpandableButton expanded sx={callerStyles.caller}>
      Expanded
    </ExpandableButton>
  </div>
);

const styles = stylex.create({
  expandableButton: {
    minHeight: 32,
    backgroundColor: "#f8fafc",
  },
  expandableButtonExpanded: {
    paddingBlock: 8,
    paddingInline: 12,
  },
  expandableButtonNotExpanded: {
    paddingBlock: 4,
    paddingInline: 8,
  },
});
