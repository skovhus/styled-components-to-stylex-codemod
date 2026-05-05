// Hovering a parent pseudo-element selector must not emit invalid nested pseudo values.
import styled from "styled-components";

const ResizeHandle = styled.div`
  position: relative;
  height: 24px;
  cursor: ns-resize;

  &::after {
    content: "";
    position: absolute;
    left: 8px;
    right: 8px;
    top: 10px;
    height: 4px;
    border-radius: 999px;
    background-color: #cbd5e1;
  }

  &:hover::after {
    background-color: #64748b;
  }
`;

export const App = () => (
  <div style={{ padding: 16, width: 220 }}>
    <ResizeHandle />
  </div>
);
