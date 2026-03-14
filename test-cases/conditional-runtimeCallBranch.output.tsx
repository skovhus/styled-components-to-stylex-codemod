import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { ColorConverter } from "./lib/helpers";

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

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <CardContainer checked={true}>Checked Card</CardContainer>
    <CardContainer checked={false}>Unchecked Card</CardContainer>
  </div>
);

const styles = stylex.create({
  cardContainer: (props: { backgroundColor: string }) => ({
    paddingBlock: 8,
    paddingInline: 12,
    backgroundColor: props.backgroundColor,
  }),
});
