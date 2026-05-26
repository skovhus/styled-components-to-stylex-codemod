import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { ColorConverter, getRowHighlightColor } from "./lib/helpers";

type CardContainerProps = { checked: boolean } & Omit<
  React.ComponentProps<"label">,
  "className" | "style" | "sx"
>;

function CardContainer(props: CardContainerProps) {
  const { children, checked } = props;
  const theme = useTheme();

  return (
    <label
      sx={styles.cardContainer(
        props.checked ? ColorConverter.cssWithAlpha(theme.color.bgSelected, 0.8) : "transparent",
      )}
    >
      {children}
    </label>
  );
}

type RowProps = { isHighlighted: boolean } & Omit<
  React.ComponentProps<"div">,
  "className" | "style" | "sx"
>;

// Preserved runtime call using a theme boolean argument (plain function, not member expression)
function Row(props: RowProps) {
  const { children, isHighlighted } = props;
  const theme = useTheme();

  return (
    <div sx={styles.row(props.isHighlighted ? getRowHighlightColor(theme.isDark) : "transparent")}>
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
  cardContainer: (backgroundColor: string) => ({
    paddingBlock: 8,
    paddingInline: 12,
    backgroundColor,
  }),
  row: (backgroundColor: string) => ({
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor,
  }),
});
