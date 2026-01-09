import * as React from "react";
import styled from "styled-components";
import { type FocusTrap as OriginalFocusTrap, createFocusTrap } from "./lib/focus-trap";
import type { SelectionFunction } from "./lib/helpers";

// Pattern 3: Type import used elsewhere in the file (not in styled component)
// The codemod must NOT strip this import even though it's not used in styled components

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

// This callback type must be preserved
export function useSelection(onSelect: SelectionFunction) {
  const handleSelect = React.useCallback<SelectionFunction>(
    (options) => {
      onSelect(options);
    },
    [onSelect],
  );
  return handleSelect;
}

// Pattern 4: Internal styled component used by another styled component AND in JSX
// The codemod must NOT remove StyledText since it's used both:
// 1. As a base for HelpText: styled(StyledText)
// 2. Directly in JSX: <StyledText>
const StyledLabel = styled.span`
  margin-left: 8px;
`;

export const HelpLabel = styled(StyledLabel)`
  margin-top: 4px;
  display: block;
`;

export function FormLabel({ optional }: { optional?: boolean }) {
  return (
    <label>
      {optional && <StyledLabel>(optional)</StyledLabel>}
      <HelpLabel>Help text</HelpLabel>
    </label>
  );
}

export function App() {
  return null;
}
