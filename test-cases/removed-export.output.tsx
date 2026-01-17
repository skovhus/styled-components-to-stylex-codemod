import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { type FocusTrap as OriginalFocusTrap, createFocusTrap } from "./lib/focus-trap";
import type { SelectionFunction } from "./lib/helpers";

type RangeInputProps = Omit<React.ComponentProps<"input">, "className" | "style">;

// Pattern 3: Type import used elsewhere in the file (not in styled component)
// The codemod must NOT strip this import even though it's not used in styled components

/**
 * A range input component.
 */
export function RangeInput(props: RangeInputProps) {
  const {} = props;
  return <input type="range" {...stylex.props(styles.rangeInput)} />;
}

type FocusTrapSuspenseFallbackProps = Omit<React.ComponentProps<"input">, "className" | "style">;

/**
 * Component to render as suspense fallback if your focus trap will suspend.
 */
export function FocusTrapSuspenseFallback(props: FocusTrapSuspenseFallbackProps) {
  const {} = props;
  return <input type="button" value="" {...stylex.props(styles.focusTrapSuspenseFallback)} />;
}

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

type StyledLabelProps = React.PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
  as?: React.ElementType;
}>;

// Pattern 4: Internal styled component used by another styled component AND in JSX
// The codemod must NOT remove StyledText since it's used both:
// 1. As a base for HelpText: styled(StyledText)
// 2. Directly in JSX: <StyledText>
function StyledLabel(props: StyledLabelProps) {
  const { as: Component = "span", className, children, style } = props;
  return <Component {...mergedSx(styles.styledLabel, className, style)}>{children}</Component>;
}

type HelpLabelProps = Omit<React.ComponentProps<typeof StyledLabel>, "className" | "style">;

export function HelpLabel(props: HelpLabelProps) {
  return <StyledLabel {...props} {...stylex.props(styles.helpLabel)} />;
}

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

export function Tooltip(props: TooltipWrapperProps) {
  // TriggerHandlers is ONLY used here in React.useRef - it must NOT be removed from import
  const handlersRef = React.useRef<TriggerHandlers>(undefined);
  return (
    <div title={props.title} {...stylex.props(styles.tooltipWrapper)}>
      {props.children}
    </div>
  );
}

// Pattern 6: Internal styled component wrapping IMPORTED component (like FormLabel.tsx)
// When: const StyledText = styled(Text) (internal) + export const HelpText = styled(StyledText)
// Bug: StyledText gets removed but HelpText still references it via:
//   - type HelpTextProps = React.ComponentProps<typeof StyledText>
//   - <StyledText {...props} .../>
import { Text } from "./lib/text";

type StyledTextProps = React.ComponentProps<typeof Text>;

function StyledText(props: StyledTextProps) {
  const { className, children, style, ...rest } = props;
  return (
    <Text {...rest} {...mergedSx(styles.text, className, style)}>
      {children}
    </Text>
  );
}

type HelpTextProps = Omit<React.ComponentProps<typeof StyledText>, "className" | "style">;

export function HelpText(props: HelpTextProps) {
  return <StyledText {...props} {...stylex.props(styles.helpText)} />;
}

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

const styles = stylex.create({
  rangeInput: {
    display: "block",
    width: "300px",
    height: "6px",
    appearance: "none",
    backgroundColor: "gray",
  },
  focusTrapSuspenseFallback: {
    opacity: 0,
    width: 0,
    height: 0,
    position: "fixed",
  },
  styledLabel: {
    marginLeft: "8px",
  },
  helpLabel: {
    marginTop: "4px",
    display: "block",
  },
  tooltipWrapper: {
    position: "relative",
    display: "inline-block",
  },
  text: {
    marginLeft: "8px",
  },
  helpText: {
    marginTop: "4px",
    display: "block",
  },
});
