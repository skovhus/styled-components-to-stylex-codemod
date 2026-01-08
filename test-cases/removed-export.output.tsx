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
});
