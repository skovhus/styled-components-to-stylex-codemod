import styled from "styled-components";

// A wrapper that conditionally sets a CSS custom property based on prop
const ContainerWrapper = styled.div<{ $width: number | undefined }>`
  overflow: hidden;
  ${(props) => (props.$width || false ? `--component-width: ${props.$width}px` : "")};
`;

// A container that uses the CSS custom property with calc()
const Container = styled.div`
  background-color: coral;
  width: calc(var(--component-width) + 60px);
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
    <ContainerWrapper $width={100}>
      <Container>Width: 100px + 60px = 160px</Container>
    </ContainerWrapper>
    <ContainerWrapper $width={200}>
      <Container>Width: 200px + 60px = 260px</Container>
    </ContainerWrapper>
    <ContainerWrapper $width={undefined}>
      <Container>Width: undefined (no custom property)</Container>
    </ContainerWrapper>
  </div>
);
