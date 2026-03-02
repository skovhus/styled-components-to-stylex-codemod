// Delegating polymorphic wrapper should use shared helper types when configured.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import type { DelegatingPolymorphicProps } from "./stylex-polymorphic-helpers";

type FlexProps = {
  debugName?: string;
};

export function Flex<C extends React.ElementType = "div">(
  props: FlexProps &
    Omit<React.ComponentPropsWithRef<C>, keyof FlexProps> & { sx?: stylex.StyleXStyles; as?: C },
) {
  const { as: Component = "div", className, children, style, sx, debugName, ...rest } = props;

  return (
    <Component {...rest} {...mergedSx([styles.flex, sx], className, style)}>
      {children}
    </Component>
  );
}

type ContentProps<C extends React.ElementType = typeof Flex> = DelegatingPolymorphicProps<
  C,
  FlexProps,
  "as" | "className" | "style" | "sx" | "forwardedAs",
  never,
  {}
>;

export function Content<C extends React.ElementType = typeof Flex>(props: ContentProps<C>) {
  return <Flex {...props} {...stylex.props(styles.content)} />;
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
    <Content>Default content</Content>
    <Content
      as="input"
      onChange={(e) => console.log("Changed to " + e.target.value)}
      value="Hello"
    />
  </div>
);

const styles = stylex.create({
  flex: {
    display: "flex",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#333",
    padding: "8px",
  },
  content: {
    backgroundColor: "#d9f6ff",
  },
});
