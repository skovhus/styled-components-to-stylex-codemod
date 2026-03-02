// Logical-OR condition: ($active || $completed) && css`...`
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type DotProps = Pick<React.ComponentProps<"div">, "children"> & {
  $active?: boolean;
  $completed?: boolean;
};

// Pattern 1: Simple logical OR
function Dot(props: DotProps) {
  const { children, $active, $completed } = props;

  return (
    <div
      {...stylex.props(styles.dot, $active || $completed ? styles.dotActiveOrCompleted : undefined)}
    >
      {children}
    </div>
  );
}

type StepProps = Pick<React.ComponentProps<"div">, "children"> & {
  $active?: boolean;
  $completed?: boolean;
};

// Pattern 2: Negated logical OR
function Step(props: StepProps) {
  const { children, $active, $completed } = props;

  return (
    <div
      {...stylex.props(styles.step, !($active || $completed) && styles.stepNotActiveOrCompleted)}
    >
      {children}
    </div>
  );
}

type BadgeProps = Pick<React.ComponentProps<"span">, "children"> & {
  $visible?: boolean;
  $primary?: boolean;
  $accent?: boolean;
};

// Pattern 3: AND wrapping OR on the right
function Badge(props: BadgeProps) {
  const { children, $visible, $primary, $accent } = props;

  return (
    <span
      {...stylex.props(
        styles.badge,
        $visible && ($primary || $accent) ? styles.badgeVisiblePrimaryOrAccent : undefined,
      )}
    >
      {children}
    </span>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20, alignItems: "center", flexWrap: "wrap" }}>
      <Dot>neither</Dot>
      <Dot $active>active</Dot>
      <Dot $completed>completed</Dot>
      <Dot $active $completed>
        both
      </Dot>

      <Step>neither</Step>
      <Step $active>active</Step>
      <Step $completed>completed</Step>

      <Badge>hidden</Badge>
      <Badge $visible>visible</Badge>
      <Badge $visible $primary>
        primary
      </Badge>
      <Badge $visible $accent>
        accent
      </Badge>
    </div>
  );
}

const styles = stylex.create({
  dot: {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "#cbd5e1",
    backgroundColor: "white",
  },
  dotActiveOrCompleted: {
    borderColor: "#6366f1",
    backgroundColor: "#6366f1",
  },
  step: {
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: "#6366f1",
    color: "white",
  },
  stepNotActiveOrCompleted: {
    backgroundColor: "#e2e8f0",
    color: "#64748b",
  },
  badge: {
    paddingBlock: "4px",
    paddingInline: "8px",
    borderRadius: "4px",
    backgroundColor: "#e2e8f0",
  },
  badgeVisiblePrimaryOrAccent: {
    backgroundColor: "#6366f1",
    color: "white",
  },
});
