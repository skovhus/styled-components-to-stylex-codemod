// Logical-OR condition: ($active || $completed) && css`...`
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type DotProps = React.PropsWithChildren<{
  active?: boolean;
  completed?: boolean;
}>;

// Pattern 1: Simple logical OR
function Dot(props: DotProps) {
  const { children, active, completed } = props;

  return (
    <div sx={[styles.dot, (active || completed) && styles.dotActiveOrCompleted]}>{children}</div>
  );
}

type StepProps = React.PropsWithChildren<{
  active?: boolean;
  completed?: boolean;
}>;

// Pattern 2: Negated logical OR
function Step(props: StepProps) {
  const { children, active, completed } = props;

  return (
    <div sx={[styles.step, !(active || completed) && styles.stepNotActiveOrCompleted]}>
      {children}
    </div>
  );
}

type BadgeProps = React.PropsWithChildren<{
  visible?: boolean;
  primary?: boolean;
  accent?: boolean;
}>;

// Pattern 3: AND wrapping OR on the right
function Badge(props: BadgeProps) {
  const { children, visible, primary, accent } = props;

  return (
    <span sx={[styles.badge, visible && (primary || accent) && styles.badgeVisiblePrimaryOrAccent]}>
      {children}
    </span>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20, alignItems: "center", flexWrap: "wrap" }}>
      <Dot>neither</Dot>
      <Dot active>active</Dot>
      <Dot completed>completed</Dot>
      <Dot active completed>
        both
      </Dot>
      <Step>neither</Step>
      <Step active>active</Step>
      <Step completed>completed</Step>
      <Badge>hidden</Badge>
      <Badge visible>visible</Badge>
      <Badge visible primary>
        primary
      </Badge>
      <Badge visible accent>
        accent
      </Badge>
    </div>
  );
}

const styles = stylex.create({
  dot: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    backgroundColor: "white",
  },
  dotActiveOrCompleted: {
    borderColor: "#6366f1",
    backgroundColor: "#6366f1",
  },
  step: {
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: "#6366f1",
    color: "white",
  },
  stepNotActiveOrCompleted: {
    backgroundColor: "#e2e8f0",
    color: "#64748b",
  },
  badge: {
    paddingBlock: 4,
    paddingInline: 8,
    borderRadius: 4,
    backgroundColor: "#e2e8f0",
  },
  badgeVisiblePrimaryOrAccent: {
    backgroundColor: "#6366f1",
    color: "white",
  },
});
