import * as React from "react";
import styled from "styled-components";
import { type FocusTrap as OriginalFocusTrap, createFocusTrap } from "./lib/focus-trap";

/**
 * A range input component.
 */
export const RangeInput = styled.input.attrs({ type: "range" })`
  display: block;
  width: 300px;
  height: 6px;
  appearance: none;
  background-color: gray;
`;

/**
 * Component to render as suspense fallback if your focus trap will suspend.
 */
export const FocusTrapSuspenseFallback = styled("input").attrs({ type: "button", value: "" })`
  opacity: 0;
  width: 0;
  height: 0;
  position: fixed;
`;

// This function uses the renamed type import - it must NOT be removed
export function useFocusTrap() {
  const focusTrap = React.useRef<OriginalFocusTrap>(undefined);

  React.useEffect(() => {
    const element = document.getElementById("trap");
    if (element) {
      focusTrap.current = createFocusTrap(element);
    }
  }, []);

  return focusTrap;
}

export function App() {
  return null;
}
