import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { ColorConverter, getRowHighlightColor } from "./lib/helpers";

type CardContainerProps = React.PropsWithChildren<{
  checked: boolean;
}>;

function CardContainer(props: CardContainerProps) {
  const { children, checked } = props;
  const theme = useTheme();

  return (
    <label
      sx={styles.cardContainer({
        backgroundColor: props.checked
          ? ColorConverter.cssWithAlpha(theme.color.bgSelected, 0.8)
          : "transparent",
      })}
    >
      {children}
    </label>
  );
}

type RowProps = React.PropsWithChildren<{
  isHighlighted: boolean;
}>;

// Preserved runtime call using a theme boolean argument (plain function, not member expression)
function Row(props: RowProps) {
  const { children, isHighlighted } = props;
  const theme = useTheme();

  return (
    <div
      sx={styles.row({
        backgroundColor: props.isHighlighted ? getRowHighlightColor(theme.isDark) : "transparent",
      })}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <CardContainer checked={true}>Checked Card</CardContainer>
    <CardContainer checked={false}>Unchecked Card</CardContainer>
    <Row isHighlighted={true}>Highlighted Row</Row>
    <Row isHighlighted={false}>Normal Row</Row>
  </div>
);

const styles = stylex.create({
  cardContainer: (props: { backgroundColor: string }) => ({
    paddingBlock: 8,
    paddingInline: 12,
    backgroundColor: props.backgroundColor,
  }),
  row: (props: { backgroundColor: string }) => ({
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: props.backgroundColor,
  }),
});
