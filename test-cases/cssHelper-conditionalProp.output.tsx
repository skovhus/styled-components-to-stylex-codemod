import * as React from "react";
import * as stylex from "@stylexjs/stylex";

interface FlexProps {
  gap?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

function Flex(props: FlexProps) {
  const { gap, className, style, children } = props;
  return (
    <div
      className={className}
      style={{
        display: "flex",
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

type ContainerProps = { color?: string } & Omit<
  React.ComponentPropsWithRef<typeof Flex>,
  "className" | "style" | "$color"
>;

export function Container(props: ContainerProps) {
  const { color, ...rest } = props;
  return (
    <Flex
      {...rest}
      {...stylex.props(
        styles.container,
        props.color ? styles.containerBackgroundColor(props.color) : undefined,
      )}
    />
  );
}

type MixedContainerProps = {
  active?: boolean;
  opacity?: number;
} & Omit<React.ComponentPropsWithRef<typeof Flex>, "className" | "style" | "$active" | "$opacity">;

export function MixedContainer(props: MixedContainerProps) {
  const { active, opacity, ...rest } = props;
  return (
    <Flex
      {...rest}
      {...stylex.props(
        styles.mixedContainer,
        active &&
          styles.mixedContainerActive({
            active,
            opacity,
          }),
      )}
    />
  );
}

type PureDynamicContainerProps = {
  active?: boolean;
  color: string;
} & Omit<React.ComponentPropsWithRef<typeof Flex>, "className" | "style" | "$color" | "$active">;

export function PureDynamicContainer(props: PureDynamicContainerProps) {
  const { color, active, ...rest } = props;
  return (
    <Flex
      {...rest}
      {...stylex.props(
        styles.pureDynamicContainer,
        active && styles.pureDynamicContainerColor(props.color),
      )}
    />
  );
}

export const App = () => (
  <>
    <Container gap={4} color="rebeccapurple">
      Hello
    </Container>
    <MixedContainer gap={4} active opacity={0.75}>
      Mixed
    </MixedContainer>
    <PureDynamicContainer gap={4} active color="crimson">
      Pure dynamic
    </PureDynamicContainer>
  </>
);

const styles = stylex.create({
  container: {
    paddingBlock: 2,
    paddingInline: 6,
    borderRadius: 3,
  },
  containerBackgroundColor: (backgroundColor: string) => ({
    backgroundColor,
  }),
  mixedContainer: {
    paddingBlock: 2,
    paddingInline: 6,
    borderRadius: 3,
  },
  mixedContainerActive: (props) => ({
    cursor: "pointer",
    opacity: props.opacity,
  }),
  pureDynamicContainer: {
    paddingBlock: 2,
    paddingInline: 6,
    borderRadius: 3,
  },
  pureDynamicContainerColor: (color: string) => ({
    color,
  }),
});
