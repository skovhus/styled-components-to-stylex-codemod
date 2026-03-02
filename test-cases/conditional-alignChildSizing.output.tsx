import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type Align = "top" | "center" | "bottom";

type ContainerProps = Omit<React.ComponentProps<"div">, "className"> & {
  align: Align;
  $property?: "width" | "height";
};

function Container(props: ContainerProps) {
  const { children, style, align } = props;

  return (
    <div
      {...mergedSx(
        [
          styles.container,
          align !== "top" && align === "center" && styles.containerAlignNotTopAlignCenter,
          align !== "top" && align !== "center" && styles.containerAlignNotTopAlignNotCenter,
        ],
        undefined,
        style,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: "16px" }}>
    <Container align="top" style={{ height: "100px", width: "80px" }}>
      <div style={{ background: "#bf4f74", padding: "8px", color: "white" }}>Top</div>
    </Container>
    <Container align="center" style={{ height: "100px", width: "80px" }}>
      <div style={{ background: "#4f74bf", padding: "8px", color: "white" }}>Center</div>
    </Container>
    <Container align="bottom" style={{ height: "100px", width: "80px" }}>
      <div style={{ background: "#22c55e", padding: "8px", color: "white" }}>Bottom</div>
    </Container>
  </div>
);

const styles = stylex.create({
  container: {
    overflow: "hidden",
    backgroundColor: "#f0f0f0",
  },
  containerAlignNotTopAlignCenter: {
    display: "flex",
    alignItems: "center",
  },
  containerAlignNotTopAlignNotCenter: {
    display: "flex",
    alignItems: "flex-end",
  },
});
