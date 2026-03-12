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
      sx={[
        styles.cardContainer,
        disabled
          ? styles.cardContainerDisabled
          : checked
            ? styles.cardContainerCheckedTrue
            : styles.cardContainerCheckedFalse,
      ]}
    >
      {children}
    </label>
  );
}

function CardContent(props: React.PropsWithChildren<{}>) {
  return <div sx={styles.cardContent}>{props.children}</div>;
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column" }}>
    <CardContainer checked={false} disabled={false}>
      <CardContent>Unchecked, not disabled</CardContent>
    </CardContainer>
    <CardContainer checked={true} disabled={false}>
      <CardContent>Checked, not disabled</CardContent>
    </CardContainer>
    <CardContainer checked={true} disabled={true}>
      <CardContent>Checked, disabled</CardContent>
    </CardContainer>
  </div>
);

const styles = stylex.create({
  cardContainer: {
    display: "flex",
    alignItems: "flex-start",
    margin: 8,
    borderRadius: 6,
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
    gap: 10,
    flex: "1",
  },
});
