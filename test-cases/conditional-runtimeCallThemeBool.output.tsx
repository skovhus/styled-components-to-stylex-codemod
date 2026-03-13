import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { getRowHighlightColor } from "./lib/helpers";

type RowProps = React.PropsWithChildren<{
  isHighlighted: boolean;
}>;

function Row(props: RowProps) {
  const { children, isHighlighted } = props;

  const theme = useTheme();

  return (
    <div
      sx={[
        styles.row,
        styles.rowBackgroundColor(
          props.isHighlighted ? getRowHighlightColor(theme.isDark) : "transparent",
        ),
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <Row isHighlighted={true}>Highlighted Row</Row>
    <Row isHighlighted={false}>Normal Row</Row>
  </div>
);

const styles = stylex.create({
  row: {
    paddingBlock: 8,
    paddingInline: 16,
  },
  rowBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
});
