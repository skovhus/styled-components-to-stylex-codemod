import * as stylex from "@stylexjs/stylex";
import React from "react";

// Bug 9: When a styled component is used as a value/reference
// (e.g., passed to another component as a prop), the codemod must
// create a wrapper function even if not exported.

interface VirtualListProps {
  outerElementType: React.ComponentType<React.HTMLAttributes<HTMLDivElement>>;
  innerElementType: React.ComponentType<React.HTMLAttributes<HTMLDivElement>>;
  children: React.ReactNode;
}

function VirtualList({
  outerElementType: Outer,
  innerElementType: Inner,
  children,
}: VirtualListProps) {
  return (
    <Outer>
      <Inner>{children}</Inner>
    </Outer>
  );
}

type OuterWrapperProps = React.PropsWithChildren<
  React.HTMLAttributes<HTMLElement> & {
    className?: string;
    style?: React.CSSProperties;
  }
>;

// These styled components are passed as values, not just rendered
function OuterWrapper(props: OuterWrapperProps) {
  const { className, children, style, ...rest } = props;

  const sx = stylex.props(styles.outerWrapper);
  return (
    <div
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

type InnerWrapperProps = React.PropsWithChildren<
  React.HTMLAttributes<HTMLElement> & {
    className?: string;
    style?: React.CSSProperties;
  }
>;

function InnerWrapper(props: InnerWrapperProps) {
  const { className, children, style, ...rest } = props;

  const sx = stylex.props(styles.innerWrapper);
  return (
    <div
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function App() {
  return (
    <VirtualList outerElementType={OuterWrapper} innerElementType={InnerWrapper}>
      <div>Item 1</div>
      <div>Item 2</div>
    </VirtualList>
  );
}

const styles = stylex.create({
  // These styled components are passed as values, not just rendered
  outerWrapper: {
    overflowY: "auto",
    scrollbarWidth: "thin",
  },
  innerWrapper: {
    position: "relative",
  },
});
