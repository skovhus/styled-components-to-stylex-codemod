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

export const App = () => (
  <Container gap={4} $color="rebeccapurple">
    Hello
  </Container>
);
