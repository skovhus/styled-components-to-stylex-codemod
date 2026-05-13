import styled from "styled-components";

// Template literal with non-transient props should emit StyleX style functions.
// These are props without the $ prefix that are used in template literal interpolations.

const Box = styled.div<{ size?: number }>`
  padding: 8px;
  width: ${(props) => `${props.size ?? 100}px`};
  height: ${(props) => `${props.size ?? 100}px`};
  background-color: paleturquoise;
  border: 2px solid teal;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 8px;
`;

const Frame = styled.div<{ svgWidth?: number; svgHeight?: number }>`
  width: ${(props) => (props.svgWidth ? `${props.svgWidth}px` : "100%")};
  aspect-ratio: ${(props) => getAspectRatio(props.svgWidth, props.svgHeight)};
  background-color: mistyrose;
  border: 2px solid crimson;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
    <Box size={150}>150x150</Box>
    <Box size={100}>100x100</Box>
    <Box>Default (100x100)</Box>
    <Frame svgWidth={160} svgHeight={90}>
      16:9 frame
    </Frame>
    <Frame>Default frame</Frame>
  </div>
);

function getAspectRatio(svgWidth?: number, svgHeight?: number): string {
  return svgWidth && svgHeight ? `${svgWidth} / ${svgHeight}` : "16 / 9";
}
