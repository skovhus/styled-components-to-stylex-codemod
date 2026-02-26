// Multi-statement if/return chain in a property-value interpolation
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type FlexContainerProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  column?: boolean;
  reverse?: boolean;
};

function FlexContainer(props: FlexContainerProps) {
  const { children, column, reverse, ...rest } = props;

  const sx = stylex.props(styles.flexContainer);

  return (
    <div
      {...rest}
      {...sx}
      style={{
        ...sx.style,
        flexDirection: props.column
          ? props.reverse
            ? "column-reverse"
            : "column"
          : props.reverse
            ? "row-reverse"
            : "row",
      }}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <FlexContainer>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Row</div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>Default</div>
    </FlexContainer>
    <FlexContainer column>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Column</div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>Down</div>
    </FlexContainer>
    <FlexContainer reverse>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Row</div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>Reverse</div>
    </FlexContainer>
    <FlexContainer column reverse>
      <div style={{ padding: 8, backgroundColor: "#bf4f74", color: "white" }}>Column</div>
      <div style={{ padding: 8, backgroundColor: "#4f74bf", color: "white" }}>Reverse</div>
    </FlexContainer>
  </div>
);

const styles = stylex.create({
  flexContainer: {
    display: "flex",
    gap: "8px",
    padding: "16px",
    backgroundColor: "#f0f0f0",
  },
});
