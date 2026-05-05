// Arithmetic on imported constants must be folded before emitting StyleX constants.
import styled from "styled-components";
import { zIndex } from "./lib/helpers";

const ToastLayer = styled.div`
  z-index: ${zIndex.dialog + 1};
  position: fixed;
  inset: 16px;
  background: white;
`;

const DropIndicator = styled.div`
  z-index: ${zIndex.popover - 1};
  position: relative;
  height: 8px;
  background: #60a5fa;
`;

export const App = () => (
  <ToastLayer>
    <DropIndicator />
  </ToastLayer>
);
