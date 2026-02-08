import styled from "styled-components";

interface FlexProps {
  direction?: string;
}

const Flex = (props: FlexProps & React.HTMLAttributes<HTMLDivElement>) => (
  <div style={{ display: "flex", flexDirection: props.direction as any }} {...props} />
);

const StyledFlex = styled(Flex).attrs({
  direction: "column",
})`
  gap: 8px;
  padding: 16px;
`;

export function App() {
  return <StyledFlex>Hello</StyledFlex>;
}
