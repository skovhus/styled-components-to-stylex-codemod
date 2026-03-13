import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import * as React from "react";

type ScrollableProps<C extends React.ElementType = "div"> = Omit<
  { applyBackground?: boolean } & React.ComponentProps<"div"> & { sx?: stylex.StyleXStyles },
  "as"
> &
  Omit<React.ComponentPropsWithRef<C>, "applyBackground"> & { sx?: stylex.StyleXStyles; as?: C };

export function Scrollable<C extends React.ElementType = "div">(props: ScrollableProps) {
  const { as: Component = "div", className, children, style, sx, applyBackground, ...rest } = props;

  return (
    <Component
      {...rest}
      {...mergedSx(
        [styles.scrollable, applyBackground && styles.scrollableApplyBackground, sx],
        className,
        style,
      )}
    >
      {children}
    </Component>
  );
}

type ScrollableDivProps = Pick<React.ComponentProps<"div">, "ref" | "children"> & {
  applyBackground?: any;
};

// ScrollableDiv wraps Scrollable and re-uses $applyBackground in its own template.
// Without explicit type param, it inherits the prop from the base component.
export function ScrollableDiv(props: ScrollableDivProps) {
  const { children, applyBackground, ...rest } = props;

  return (
    <div
      {...rest}
      sx={[
        styles.scrollable,
        styles.scrollableDiv,
        applyBackground
          ? styles.scrollableDivApplyBackground
          : styles.scrollableDivNotApplyBackground,
      ]}
    >
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16 }}>
      <Scrollable applyBackground>With Background</Scrollable>
      <Scrollable>Without Background</Scrollable>
      <ScrollableDiv applyBackground>Div With BG</ScrollableDiv>
      <ScrollableDiv>Div Without BG</ScrollableDiv>
    </div>
  );
}

const styles = stylex.create({
  scrollable: {
    overflow: "auto",
    backgroundColor: "transparent",
  },
  scrollableApplyBackground: {
    backgroundColor: "white",
  },
  scrollableDiv: {
    overflow: "hidden",
  },
  scrollableDivNotApplyBackground: {
    borderStyle: "none",
  },
  scrollableDivApplyBackground: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "gray",
  },
});
