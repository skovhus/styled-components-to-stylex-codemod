import * as stylex from "@stylexjs/stylex";
import * as React from "react";
import { type FocusTrap as OriginalFocusTrap, createFocusTrap } from "./lib/focus-trap";
import type { SelectionFunction } from "./lib/helpers";

type RangeInputProps = React.ComponentProps<"input">;

// Pattern 3: Type import used elsewhere in the file (not in styled component)
// The codemod must NOT strip this import even though it's not used in styled components

/**
 * A range input component.
 */
export function RangeInput(props: RangeInputProps) {
  const { style, ...rest } = props;
  return <input type="range" {...rest} {...stylex.props(styles.rangeInput)} style={style} />;
}

type FocusTrapSuspenseFallbackProps = React.ComponentProps<"input">;

/**
 * Component to render as suspense fallback if your focus trap will suspend.
 */
export function FocusTrapSuspenseFallback(props: FocusTrapSuspenseFallbackProps) {
  const { style, ...rest } = props;
  return (
    <input
      type="button"
      value=""
      {...rest}
      {...stylex.props(styles.focusTrapSuspenseFallback)}
      style={style}
    />
  );
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

type StyledLabelProps = React.ComponentProps<"span">;

// Pattern 4: Internal styled component used by another styled component AND in JSX
// The codemod must NOT remove StyledText since it's used both:
// 1. As a base for HelpText: styled(StyledText)
// 2. Directly in JSX: <StyledText>
function StyledLabel(props: StyledLabelProps) {
  const { className, children, style, ...rest } = props;

  const sx = stylex.props(styles.styledLabel);
  return (
    <span
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}

type HelpLabelProps = React.ComponentProps<typeof StyledLabel>;

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
});
