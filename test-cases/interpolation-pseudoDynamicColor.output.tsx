import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type SwatchProps = React.PropsWithChildren<{
  color: string;
  shadow?: string;
}>;

function Swatch(props: SwatchProps) {
  const { children, color } = props;
  return (
    <div
      sx={[
        colorVariants[color as keyof typeof colorVariants] ?? styles.swatchColor(color),
        styles.swatch(color),
      ]}
    >
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 12, padding: 16 }}>
      <Swatch color="#bf4f74">Pink</Swatch>
      <Swatch color="#4caf50">Green</Swatch>
      <Swatch color="#2196f3">Blue</Swatch>
    </div>
  );
}

const styles = stylex.create({
  swatch: (color: string) => ({
    width: 60,
    height: 60,
    borderRadius: 8,
    cursor: "pointer",
    transition: "box-shadow 0.2s",
    boxShadow: {
      default: null,
      ":hover": `0 0 0 3px ${color}`,
    },
  }),
  swatchColor: (color: string) => ({
    backgroundColor: `${color}`,
  }),
});

const colorVariants = stylex.create({
  "#bf4f74": {
    backgroundColor: "#bf4f74",
  },
  "#4caf50": {
    backgroundColor: "#4caf50",
  },
  "#2196f3": {
    backgroundColor: "#2196f3",
  },
});
