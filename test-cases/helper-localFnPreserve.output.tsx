// Local function preserved as runtime call when used with theme args
import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";

function caret(color: string): string {
  return `inset 0 -2px 0 ${color}`;
}

function CaretBox(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();
  return <div sx={styles.caretBox(caret(theme.color.labelMuted))}>{props.children}</div>;
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <CaretBox>Caret box</CaretBox>
    </div>
  );
}

const styles = stylex.create({
  caretBox: (boxShadow: string) => ({
    padding: 16,
    backgroundColor: "#f5f5f5",
    boxShadow,
  }),
});
