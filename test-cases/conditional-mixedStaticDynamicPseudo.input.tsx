import styled, { css } from "styled-components";

// Ternary conditionals inside pseudo selectors using css helper.
// Both branches of the inner ternary are statically resolvable,
// so we can create pseudo-wrapped conditional variants.

const OFFSET = 24;

interface Props {
  $collapsed: boolean;
  $enabled: boolean;
}

const Container = styled.div<Props>`
  position: relative;
  padding: 20px;
  background-color: #f5f5f5;

  ${(props) =>
    props.$enabled
      ? css`
          &:hover {
            left: ${props.$collapsed ? 0 : OFFSET}px;
            opacity: 0.8;
          }
        `
      : ""}
`;

export const App = () => (
  <div style={{ display: "flex", gap: "12px", padding: "12px" }}>
    <Container $collapsed={false} $enabled={true}>
      Enabled, Not Collapsed
    </Container>
    <Container $collapsed={true} $enabled={true}>
      Enabled, Collapsed
    </Container>
    <Container $collapsed={false} $enabled={false}>
      Disabled
    </Container>
  </div>
);
