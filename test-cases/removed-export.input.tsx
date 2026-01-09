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

// Pattern 5: Type-only import with MULTIPLE types where some are used in styled component props
// and others are ONLY used in React.useRef<T> (generic type parameter)
// The codemod must NOT strip TriggerHandlers even though it's not used in styled component props
import type { TooltipBaseProps, TriggerHandlers } from "./lib/helpers";

interface TooltipWrapperProps extends TooltipBaseProps {
  children: React.ReactNode;
}

const TooltipWrapper = styled.div<TooltipBaseProps>`
  position: relative;
  display: inline-block;
`;

export function Tooltip(props: TooltipWrapperProps) {
  // TriggerHandlers is ONLY used here in React.useRef - it must NOT be removed from import
  const handlersRef = React.useRef<TriggerHandlers>(undefined);

  return (
    <TooltipWrapper title={props.title} position={props.position}>
      {props.children}
    </TooltipWrapper>
  );
}

// Pattern 6: Internal styled component wrapping IMPORTED component (like FormLabel.tsx)
// When: const StyledText = styled(Text) (internal) + export const HelpText = styled(StyledText)
// Bug: StyledText gets removed but HelpText still references it via:
//   - type HelpTextProps = React.ComponentProps<typeof StyledText>
//   - <StyledText {...props} .../>
import { Text } from "./lib/text";

const StyledText = styled(Text)`
  margin-left: 8px;
`;

export const HelpText = styled(StyledText)`
  margin-top: 4px;
  display: block;
`;

export function FormLabelWithText({
  optional,
  children,
}: {
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label>
      {children}
      {optional && (
        <StyledText variant="small" color="muted">
          (optional)
        </StyledText>
      )}
      <HelpText variant="mini" color="muted">
        Help text
      </HelpText>
    </label>
  );
}

export function App() {
  return null;
}
