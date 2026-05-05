// Conditional pseudo-element styles must affect only the pseudo-element.
import styled, { css } from "styled-components";

const OverlayList = styled.ul<{ $hideOverlay?: boolean }>`
  position: relative;
  min-height: 72px;
  padding: 16px;
  background: #f8fafc;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent, rgba(15, 23, 42, 0.2));
    pointer-events: none;
  }

  ${(props) =>
    props.$hideOverlay
      ? css`
          &::after {
            display: none;
          }
        `
      : ""}
`;

export const App = () => (
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <OverlayList>
      <li>Overlay visible</li>
    </OverlayList>
    <OverlayList $hideOverlay>
      <li>Overlay hidden</li>
    </OverlayList>
  </div>
);
