import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { breakpoints } from "./lib/breakpoints.stylex";
import { fontSizeVars } from "./tokens.stylex";

type TitleProps = React.PropsWithChildren<{
  size?: "small" | "large";
}>;

function Title(props: TitleProps) {
  const { children, size } = props;

  return <div sx={[styles.title, size === "large" && styles.titleSizeLarge]}>{children}</div>;
}

type CardProps = React.PropsWithChildren<{
  checked: boolean;
  disabled?: boolean;
}>;

function Card(props: CardProps) {
  const { children, checked, disabled } = props;

  return (
    <label
      sx={[
        styles.card,
        disabled ? styles.cardDisabled : checked ? styles.cardCheckedTrue : styles.cardCheckedFalse,
        checked && styles.cardChecked,
      ]}
    >
      {children}
    </label>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <Title>Default Title</Title>
      <Title size="large">Large Title</Title>
      <Title size="small">Small Title</Title>
      <Card checked={false}>
        <span>Unchecked</span>
      </Card>
      <Card checked>
        <span>Checked</span>
      </Card>
      <Card checked disabled>
        <span>Checked Disabled</span>
      </Card>
      <Card checked={false} disabled>
        <span>Unchecked Disabled</span>
      </Card>
    </div>
  );
}

const styles = stylex.create({
  title: {
    fontSize: {
      default: fontSizeVars.small,
      [breakpoints.phone]: fontSizeVars.small,
    },
    fontWeight: 500,
    color: "#333",
  },
  titleSizeLarge: {
    fontSize: {
      default: fontSizeVars.large,
      [breakpoints.phone]: fontSizeVars.medium,
    },
  },
  card: {
    display: "flex",
    padding: 16,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
    borderRadius: 6,
    cursor: "pointer",
  },
  cardChecked: {
    borderColor: {
      default: "#0066cc",
      ":hover": "#0066cc",
    },
  },
  cardDisabled: {
    cursor: "not-allowed",
    borderColor: {
      default: "#ccc",
      ":hover": "#ddd",
    },
  },
  cardCheckedTrue: {
    borderColor: {
      default: "#0066cc",
      ":hover": "#0044aa",
    },
  },
  cardCheckedFalse: {
    borderColor: {
      default: "#ccc",
      ":hover": "#999",
    },
  },
});
