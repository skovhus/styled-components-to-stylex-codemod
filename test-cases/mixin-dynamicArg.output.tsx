import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";

type TitleTextProps = React.PropsWithChildren<{
  $oneLine: boolean;
}>;

function TitleText(props: TitleTextProps) {
  const { children, $oneLine } = props;

  return (
    <div
      {...stylex.props(
        styles.titleText,
        $oneLine ? helpers.truncateMultiline(1) : undefined,
        !$oneLine && helpers.truncateMultiline(2),
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
    <TitleText $oneLine>One line truncated</TitleText>
    <TitleText $oneLine={false}>
      Two line truncated text that should wrap to a second line before being cut off
    </TitleText>
  </div>
);

const styles = stylex.create({
  titleText: {
    lineHeight: "1rem",
  },
});
