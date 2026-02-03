import styled from "styled-components";
import { truncate } from "./lib/helpers";

// Helper call in conditional - should apply truncation when truthy
const Text = styled.p<{ $truncate?: boolean }>`
  font-size: 14px;
  ${(props) => (props.$truncate ? truncate() : "")}
`;

// Helper call in alternate - should apply truncation when falsy
const TextAlt = styled.p<{ $noTruncate?: boolean }>`
  font-size: 14px;
  ${(props) => (props.$noTruncate ? "" : truncate())}
`;

const Title = styled("div")<{ maxWidth?: number; $truncateTitle?: boolean }>`
  font-size: 50px;
  ${(props) => (props.$truncateTitle ? truncate() : "")}
  ${(props) => props.maxWidth && `max-width: ${props.maxWidth}px;`}
`;

export const App = () => (
  <div style={{ width: 200, border: "1px solid #ccc", padding: 8 }}>
    <Title $truncateTitle maxWidth={200}>
      Truncated title
    </Title>
    <Text>Normal text without truncation that can wrap to multiple lines</Text>
    <Text $truncate>
      Truncated text that will have ellipsis when it overflows the container width
    </Text>
    <TextAlt $noTruncate>Normal text without truncation that can wrap to multiple lines</TextAlt>
    <TextAlt>Truncated text that will have ellipsis when it overflows</TextAlt>
  </div>
);
