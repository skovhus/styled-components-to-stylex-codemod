import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars, $colors } from "./tokens.stylex";

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

type TernaryPureDynamicContainerProps = {
  active?: boolean;
  color: string;
} & Omit<React.ComponentPropsWithRef<typeof Flex>, "className" | "style" | "$color" | "$active">;

export function TernaryPureDynamicContainer(props: TernaryPureDynamicContainerProps) {
  const { color, active, ...rest } = props;
  return (
    <Flex
      {...rest}
      {...stylex.props(
        styles.ternaryPureDynamicContainer,
        active && styles.ternaryPureDynamicContainerColor(props.color),
      )}
    />
  );
}

type InvertedTernaryPureDynamicContainerProps = {
  active?: boolean;
  color: string;
} & Omit<React.ComponentPropsWithRef<typeof Flex>, "className" | "style" | "$color" | "$active">;

export function InvertedTernaryPureDynamicContainer(
  props: InvertedTernaryPureDynamicContainerProps,
) {
  const { color, active, ...rest } = props;
  return (
    <Flex
      {...rest}
      {...stylex.props(
        styles.invertedTernaryPureDynamicContainer,
        !active && styles.invertedTernaryPureDynamicContainerColor(props.color),
      )}
    />
  );
}

type HighlightedShadowContainerProps = { isHighlighted?: boolean } & Omit<
  React.ComponentPropsWithRef<typeof Flex>,
  "className" | "style" | "$isHighlighted"
>;

export function HighlightedShadowContainer(props: HighlightedShadowContainerProps) {
  const { isHighlighted, ...rest } = props;
  return (
    <Flex
      {...rest}
      {...stylex.props(
        styles.highlightedShadowContainer,
        isHighlighted && styles.highlightedShadowContainerHighlighted,
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
    <TernaryPureDynamicContainer gap={4} active color="darkgreen">
      Ternary pure dynamic
    </TernaryPureDynamicContainer>
    <InvertedTernaryPureDynamicContainer gap={4} color="darkblue">
      Inverted ternary pure dynamic
    </InvertedTernaryPureDynamicContainer>
    <HighlightedShadowContainer gap={4} isHighlighted>
      Highlighted shadow
    </HighlightedShadowContainer>
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
  pureDynamicContainerColor: (colorValue: string) => ({
    color: colorValue,
  }),
  ternaryPureDynamicContainer: {
    paddingBlock: 2,
    paddingInline: 6,
    borderRadius: 3,
  },
  ternaryPureDynamicContainerColor: (colorValue: string) => ({
    color: colorValue,
  }),
  invertedTernaryPureDynamicContainer: {
    paddingBlock: 2,
    paddingInline: 6,
    borderRadius: 3,
  },
  invertedTernaryPureDynamicContainerColor: (colorValue: string) => ({
    color: colorValue,
  }),
  highlightedShadowContainer: {
    paddingBlock: 2,
    paddingInline: 6,
    borderRadius: 3,
  },
  highlightedShadowContainerHighlighted: {
    boxShadow: `inset 0 0 0 ${pixelVars.thin} ${$colors.controlPrimary}`,
  },
});
