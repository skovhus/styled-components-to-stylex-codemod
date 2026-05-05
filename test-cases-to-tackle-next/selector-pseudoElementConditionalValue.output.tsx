// Preserve this styled component until pseudo-element conditional values can be emitted in a valid StyleX shape.
import styled, { css } from "styled-components";

const ExpandableItem = styled.div<{ $expanded?: boolean }>`
  position: relative;
  padding: 12px 16px 12px 28px;
  background-color: #f8fafc;

  &::before {
    content: "";
    position: absolute;
    left: 8px;
    top: 50%;
    width: 8px;
    height: 8px;
    transform: translateY(-50%);
    background-color: #94a3b8;

    ${(props) =>
      props.$expanded &&
      css`
        background-color: #16a34a;

        &:hover {
          background-color: #15803d;
        }
      `}
  }
`;

export const App = () => (
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <ExpandableItem>Collapsed</ExpandableItem>
    <ExpandableItem $expanded>Expanded</ExpandableItem>
  </div>
);
