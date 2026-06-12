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

function CardContent({ children }: { children?: React.ReactNode }) {
  return <div sx={styles.cardContent}>{children}</div>;
}

type FadeBoxProps = React.PropsWithChildren<{
  active?: boolean;
  size?: string;
}>;

// Nested ternary where the dynamic branch references a second prop through a
// short-named arrow param (must be rewritten, not leaked, into the style fn)
function FadeBox(props: FadeBoxProps) {
  const { children, size, active } = props;
  return <div sx={[styles.fadeBox, active && styles.fadeBoxOpacity(size)]}>{children}</div>;
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
    <FadeBox active size="large">
      Active large (opacity 1)
    </FadeBox>
    <FadeBox active>Active small (opacity 0.5)</FadeBox>
    <FadeBox>Inactive (opacity 0.1)</FadeBox>
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
    borderWidth: 1,
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
  fadeBox: {
    padding: 8,
    backgroundColor: "lavender",
    opacity: 0.1,
  },
  fadeBoxOpacity: (size: string | undefined) => ({
    opacity: size === "large" ? 1 : 0.5,
  }),
});
