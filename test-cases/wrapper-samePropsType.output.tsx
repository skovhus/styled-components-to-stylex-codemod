// Test case for wrappers using the same props type name as the base component
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// P1: Self-referential props issue
// When styled(Base)<Props> where Base also uses Props,
// this could create a circular reference type Props = Props & ...
type SharedProps = {
  column?: boolean;
  gap?: number;
};

// Base uses SharedProps
function Base<C extends React.ElementType = "div">(
  props: SharedProps &
    Omit<React.ComponentPropsWithRef<C>, keyof SharedProps> & { sx?: stylex.StyleXStyles; as?: C },
) {
  const { as: Component = "div", className, children, style, sx, gap, column, ...rest } = props;
  return (
    <Component
      {...rest}
      {...mergedSx([styles.base(gap), column && styles.baseColumn, sx], className, style)}
    >
      {children}
    </Component>
  );
}

// Wrapper ALSO uses SharedProps - must not create circular reference
export function Wrapper(
  props: SharedProps & Omit<React.ComponentPropsWithRef<"div">, keyof SharedProps | "className">,
) {
  const { children, ...rest } = props;
  return (
    <Base {...rest} sx={styles.wrapper}>
      {children}
    </Base>
  );
}

// P2: Type with parameters (tests that type arguments are preserved)
type GenericProps<T extends string> = {
  variant: T;
  size?: number;
};

// When wrapping with parameterized type, the type args must be preserved
export function Button(
  props: GenericProps<"primary" | "secondary"> &
    Omit<React.ComponentProps<"button">, "className" | "style">,
) {
  const { children, size, variant, ...rest } = props;
  return (
    <button
      {...rest}
      sx={[styles.button(size), variant === "primary" && styles.buttonVariantPrimary]}
    >
      {children}
    </button>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
      <Wrapper column gap={8} style={{ backgroundColor: "#f0f0f0" }}>
        Wrapper with column and gap
      </Wrapper>
      <Button variant="primary" size={18} onClick={() => alert("clicked")}>
        Primary Button
      </Button>
      <Button variant="secondary">Secondary Button</Button>
    </div>
  );
}

const styles = stylex.create({
  base: (gap: number | undefined) => ({
    display: "flex",
    flexDirection: "row",
    gap: gap ? `${gap}px` : "0",
  }),
  baseColumn: {
    flexDirection: "column",
  },
  wrapper: {
    padding: 8,
  },
  button: (size: number | undefined) => ({
    backgroundColor: "gray",
    fontSize: size ? `${size}px` : "14px",
  }),
  buttonVariantPrimary: {
    backgroundColor: "blue",
  },
});
