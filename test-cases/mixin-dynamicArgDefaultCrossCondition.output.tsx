import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { helpers } from "./lib/helpers.stylex";

type TitleTextProps = React.PropsWithChildren<{
  $oneLine?: boolean;
}>;

// Default should only be hoisted when the prop is used exclusively by the
// merged helper-call conditional. Here, another interpolation depends on the
// same prop in a separate style condition, so wrapper-level defaulting would change
// semantics and must not be applied.
function TitleText(props: TitleTextProps) {
  const { children, $oneLine } = props;

  const sx = stylex.props(
    styles.titleText,
    $oneLine === undefined || $oneLine
      ? helpers.truncateMultiline(1)
      : helpers.truncateMultiline(2),
  );

  return (
    <div
      {...sx}
      style={{
        ...sx.style,
        color: props.$oneLine === undefined ? "purple" : "teal",
      }}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
    <TitleText>Default one-line and purple</TitleText>
    <TitleText $oneLine={false}>Two-line and teal</TitleText>
  </div>
);

const styles = stylex.create({
  titleText: {
    lineHeight: "1rem",
  },
});
