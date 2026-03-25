// Universal selector with only inherited CSS properties — lifted to parent
import styled from "styled-components";

// All inherited properties in & * should merge into base styles
const TextContainer = styled.div`
  padding: 16px;
  background-color: #f0f0f0;

  & * {
    color: hotpink;
    font-family: "Helvetica", sans-serif;
    line-height: 1.5;
  }
`;

// Multiple groups: base + inherited universal
const HeadingReset = styled.section`
  display: flex;
  gap: 8px;

  & * {
    font-weight: bold;
    letter-spacing: 0.5px;
    text-align: center;
  }
`;

// Bare * selector with theme interpolation (adapter-resolved)
const ThemedContainer = styled.div`
  padding: 12px;

  * {
    color: ${(props) => props.theme.color.labelMuted};
    cursor: pointer;
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px" }}>
    <TextContainer>
      <p>Paragraph in hotpink</p>
      <span>Span in hotpink</span>
    </TextContainer>
    <HeadingReset>
      <p>Bold centered</p>
      <div>Also bold centered</div>
    </HeadingReset>
    <ThemedContainer>
      <span>Themed text</span>
    </ThemedContainer>
  </div>
);
