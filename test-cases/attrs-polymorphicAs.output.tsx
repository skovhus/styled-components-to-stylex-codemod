import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// Pattern: styled(Component).attrs({ as: "element" })
// The "as" prop changes the underlying element type
// The generated type must account for the polymorphic element change

interface TextProps {
  variant?: "small" | "medium" | "large";
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/** A polymorphic Text component that accepts "as" prop */
function Text<C extends React.ElementType = "span">(
  props: TextProps & React.ComponentPropsWithRef<C> & { as?: C },
) {
  const { as: Component = "span", children, className, style, ...rest } = props;
  return (
    <Component className={className} style={style} {...rest}>
      {children}
    </Component>
  );
}

type LabelProps = {
  sx?: stylex.StyleXStyles;
  htmlFor?: string;
  ref?: React.Ref<HTMLLabelElement>;
} & { sx?: stylex.StyleXStyles } & Omit<React.ComponentPropsWithRef<typeof Text>, "as">;

/**
 * Label component using .attrs to set as="label"
 * The wrapper should use label-specific props (htmlFor)
 */
export function Label(props: LabelProps) {
  const { className, children, style, sx, ...rest } = props;
  return (
    <Text {...rest} as="label" {...mergedSx([styles.label, sx], className, style)}>
      {children}
    </Text>
  );
}

type FixedHrefTextProps<C extends React.ElementType = typeof Text> = Omit<
  React.ComponentPropsWithRef<typeof Text>,
  "href"
> &
  Omit<
    React.ComponentPropsWithRef<C>,
    keyof React.ComponentPropsWithRef<typeof Text> | "className" | "style" | "href"
  > & {
    as?: C;
  } & { sx?: stylex.StyleXStyles };

/** Fixed href supplied by attrs should be omitted from polymorphic C props */
export function FixedHrefText<C extends React.ElementType = typeof Text>(
  props: FixedHrefTextProps<C>,
) {
  const { as: Component = Text, className, style, sx, ...rest } = props;
  return (
    <Component
      {...rest}
      href="/fixed"
      {...mergedSx([styles.fixedHrefText, sx], className, style)}
    />
  );
}

/** forwardedAs attrs normalize to an emitted "as" prop */
export function ForwardedAsText(
  props: { sx?: stylex.StyleXStyles } & Omit<React.ComponentPropsWithRef<typeof Text>, "as">,
) {
  const { className, children, style, sx, ...rest } = props;
  return (
    <Text {...rest} as="em" {...mergedSx([styles.forwardedAsText, sx], className, style)}>
      {children}
    </Text>
  );
}

// Usage with label-specific props
export const App = () => (
  <>
    <Label htmlFor="input-id">Click me</Label>
    <FixedHrefText as="a">Fixed href</FixedHrefText>
    <ForwardedAsText>Forwarded as emphasis</ForwardedAsText>
  </>
);

const styles = stylex.create({
  label: {
    borderColor: "blue",
  },
  fixedHrefText: {
    textDecoration: "underline",
  },
  forwardedAsText: {
    color: "purple",
  },
});
