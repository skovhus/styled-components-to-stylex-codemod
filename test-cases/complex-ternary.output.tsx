import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";

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
  <div>
    <CardContainer checked={false} disabled={false}>
      <div {...stylex.props(styles.cardContent)}>Option 1</div>
    </CardContainer>
    <CardContainer checked={true} disabled={true}>
      <div {...stylex.props(styles.cardContent)}>Option 2</div>
    </CardContainer>
  </div>
);

const styles = stylex.create({
  cardContainer: {
    display: "flex",
    alignItems: "flex-start",
    padding: "16px",
    borderRadius: "6px",
    opacity: 1,
    position: "relative",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: themeVars.bgSub,
    outlineStyle: {
      default: null,
      ":focus-within:has(:focus-visible)": "solid",
    },
  },
  cardContainerDisabled: {
    opacity: 0.5,
    borderColor: {
      default: null,
      ":hover": themeVars.bgBase,
    },
  },
  cardContainerCheckedTrue: {
    borderColor: {
      default: null,
      ":hover": themeVars.bgSub,
    },
  },
  cardContainerCheckedFalse: {
    borderColor: {
      default: null,
      ":hover": themeVars.bgBase,
    },
  },
  cardContent: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    flex: "1",
  },
});
