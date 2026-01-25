import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type CardContainerProps = React.PropsWithChildren<{
  checked: boolean;
  disabled?: boolean;
}>;

function CardContainer(props: CardContainerProps) {
  const { children, disabled, checked } = props;
  return (
    <label
      {...stylex.props(
        styles.cardContainer,
        disabled
          ? styles.cardContainerDisabled
          : checked
            ? styles.cardContainerCheckedTrue
            : styles.cardContainerCheckedFalse,
      )}
    >
      {children}
    </label>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column" }}>
    <CardContainer checked={false} disabled={false}>
      <div {...stylex.props(styles.cardContent)}>Unchecked, not disabled</div>
    </CardContainer>
    <CardContainer checked={true} disabled={false}>
      <div {...stylex.props(styles.cardContent)}>Checked, not disabled</div>
    </CardContainer>
    <CardContainer checked={true} disabled={true}>
      <div {...stylex.props(styles.cardContent)}>Checked, disabled</div>
    </CardContainer>
  </div>
);

const styles = stylex.create({
  cardContainer: {
    display: "flex",
    alignItems: "flex-start",
    margin: "8px",
    borderRadius: "6px",
    opacity: 1,
    position: "relative",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: $colors.bgSub,
    outlineStyle: {
      default: null,
      ":focus-within:has(:focus-visible)": "solid",
    },
  },
  cardContainerDisabled: {
    opacity: 0.5,
    borderColor: {
      default: $colors.bgSub,
      ":hover": $colors.bgBase,
    },
  },
  cardContainerCheckedTrue: {
    borderColor: {
      default: $colors.bgSub,
      ":hover": $colors.bgSub,
    },
  },
  cardContainerCheckedFalse: {
    borderColor: {
      default: $colors.bgSub,
      ":hover": $colors.bgBase,
    },
  },
  cardContent: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    flex: "1",
  },
});
