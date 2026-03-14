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

// DOM elements: transient props must NOT leak to the underlying element
export const Box = styled.div<{
  $isActive?: boolean;
  $size?: "small" | "large";
}>`
  padding: ${(props) => (props.$size === "large" ? "16px" : "8px")};
  background: ${(props) => (props.$isActive ? "blue" : "gray")};
  color: white;
`;

export const Image = styled.img<{ $isInactive?: boolean }>`
  opacity: ${(props) => (props.$isInactive ? 0.5 : 1)};
  border-radius: 50%;
`;

// Usage
export const App = () => (
  <div>
    <Scrollable $applyBackground column gap={10}>
      <div>Item 1</div>
      <div>Item 2</div>
    </Scrollable>
    <Box $isActive $size="large">
      Active large box
    </Box>
    <Box $size="small">Small inactive box</Box>
    <Image $isInactive src="/avatar.png" alt="Avatar" />
  </div>
);
