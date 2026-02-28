// Style function props (bg, text) should NOT be forwarded to the wrapped component
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Box = styled(Flex)<{ bg: string; text: string }>`
  background-color: ${(props) => props.bg};
  color: ${(props) => props.text};
  padding: 8px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Box bg="#bf4f74" text="white" gap={8}>
      Red
    </Box>
    <Box bg="#4f74bf" text="black" gap={12}>
      Blue
    </Box>
  </div>
);
