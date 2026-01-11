import styled from "styled-components";

// Pattern: styled(Component) with transient prop used only for styling
// The transient prop should NOT be forwarded to the wrapped component
// because the wrapped component doesn't accept it

interface FlexProps {
  column?: boolean;
  gap?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/** A Flex component - does NOT accept $applyBackground */
function Flex(props: FlexProps) {
  const { column, gap, className, style, children } = props;
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: column ? "column" : "row",
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface ScrollableProps {
  /** Whether to apply background color - used only for styling */
  $applyBackground?: boolean;
}

/**
 * Scrollable wraps Flex and adds a transient prop for conditional styling.
 * The $applyBackground prop must NOT be passed to Flex since Flex doesn't accept it.
 */
export const Scrollable = styled(Flex)<ScrollableProps>`
  overflow-y: auto;
  background-color: ${(props) => (props.$applyBackground ? "gray" : "inherit")};
`;

// Usage
export const App = () => (
  <Scrollable $applyBackground column gap={10}>
    <div>Item 1</div>
    <div>Item 2</div>
  </Scrollable>
);
