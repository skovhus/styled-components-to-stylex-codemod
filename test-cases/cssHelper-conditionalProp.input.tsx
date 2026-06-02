import styled, { css } from "styled-components";

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

export const Container = styled(Flex)<{ $color?: string }>`
  ${(props) =>
    props.$color &&
    css`
      background-color: ${props.$color};
    `}
  padding: 2px 6px;
  border-radius: 3px;
`;

export const MixedContainer = styled(Flex)<{ $active?: boolean; $opacity?: number }>`
  ${(props) =>
    props.$active &&
    css`
      cursor: pointer;
      opacity: ${props.$opacity};
    `}
  padding: 2px 6px;
  border-radius: 3px;
`;

export const PureDynamicContainer = styled(Flex)<{ $active?: boolean; $color: string }>`
  ${(props) =>
    props.$active &&
    css`
      color: ${props.$color};
    `}
  padding: 2px 6px;
  border-radius: 3px;
`;

export const TernaryPureDynamicContainer = styled(Flex)<{ $active?: boolean; $color: string }>`
  ${(props) =>
    props.$active
      ? css`
          color: ${props.$color};
        `
      : undefined}
  padding: 2px 6px;
  border-radius: 3px;
`;

export const InvertedTernaryPureDynamicContainer = styled(Flex)<{
  $active?: boolean;
  $color: string;
}>`
  ${(props) =>
    props.$active
      ? undefined
      : css`
          color: ${props.$color};
        `}
  padding: 2px 6px;
  border-radius: 3px;
`;

export const App = () => (
  <>
    <Container gap={4} $color="rebeccapurple">
      Hello
    </Container>
    <MixedContainer gap={4} $active $opacity={0.75}>
      Mixed
    </MixedContainer>
    <PureDynamicContainer gap={4} $active $color="crimson">
      Pure dynamic
    </PureDynamicContainer>
    <TernaryPureDynamicContainer gap={4} $active $color="darkgreen">
      Ternary pure dynamic
    </TernaryPureDynamicContainer>
    <InvertedTernaryPureDynamicContainer gap={4} $color="darkblue">
      Inverted ternary pure dynamic
    </InvertedTernaryPureDynamicContainer>
  </>
);
