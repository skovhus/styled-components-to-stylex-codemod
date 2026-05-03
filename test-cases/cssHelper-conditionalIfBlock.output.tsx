import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Browser } from "./lib/helpers";

type ContainerProps = { size: number } & Omit<React.ComponentProps<"div">, "className" | "style">;

export function Container(props: ContainerProps) {
  const { children, size, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.container,
        Browser.isSafari ? styles.containerBrowserIsSafari(size) : styles.containerDefault(size),
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <Container size={16}>16px branch text</Container>
    <Container size={28}>28px branch text</Container>
  </div>
);

const styles = stylex.create({
  container: {
    display: "inline-flex",
  },
  containerBrowserIsSafari: (size: number) => ({
    fontSize: `${size - 4}px`,
    lineHeight: 1,
  }),
  containerDefault: (size: number) => ({
    fontSize: `${size - 3}px`,
    lineHeight: `${size}px`,
  }),
});
