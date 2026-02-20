import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";

type TitleTextProps = React.PropsWithChildren<{
  $oneLine?: boolean;
}>;

// Destructured default should preserve `undefined` semantics:
// omitted $oneLine uses the default true branch.
function TitleText(props: TitleTextProps) {
  const { children, $oneLine = true } = props;

  return (
    <div
      {...stylex.props(
        styles.titleText,
        $oneLine ? helpers.truncateMultiline(1) : helpers.truncateMultiline(2),
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
    <TitleText>Default (should use 1-line)</TitleText>
    <TitleText $oneLine={false}>Two-line truncated</TitleText>
  </div>
);

const styles = stylex.create({
  titleText: {
    lineHeight: "1rem",
  },
});
