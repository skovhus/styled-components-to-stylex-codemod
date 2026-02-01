import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

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

type OuterWrapperProps = Omit<React.ComponentProps<"div">, "style">;

// These styled components are passed as values, not just rendered
function OuterWrapper(props: OuterWrapperProps) {
  const { className, children, ...rest } = props;
  return (
    <div {...rest} {...mergedSx(styles.outerWrapper, className)}>
      {children}
    </div>
  );
}

type InnerWrapperProps = Omit<React.ComponentProps<"div">, "style">;

function InnerWrapper(props: InnerWrapperProps) {
  const { className, children, ...rest } = props;
  return (
    <div {...rest} {...mergedSx(styles.innerWrapper, className)}>
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
  outerWrapper: {
    overflowY: "auto",
    scrollbarWidth: "thin",
  },
  innerWrapper: {
    position: "relative",
  },
});
