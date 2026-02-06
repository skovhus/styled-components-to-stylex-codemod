import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export enum Status {
  active = "active",
  inactive = "inactive",
}

type IconWithTeamColorProps = Omit<React.ComponentProps<"svg">, "className" | "style"> & {
  $color?: string;
};

// Styled component with conditional CSS based on prop
// Uses ternary: props.$color ? `fill: ${props.$color};` : ""
export function IconWithTeamColor(props: IconWithTeamColorProps) {
  const { children, $color, ...rest } = props;

  const sx = stylex.props($color ? styles.iconWithTeamColorFill($color) : undefined);

  return (
    <svg {...rest} {...sx} className={["color-override", sx.className].filter(Boolean).join(" ")}>
      {children}
    </svg>
  );
}

interface Props extends React.SVGProps<SVGSVGElement> {
  status: Status;
  noDate?: boolean;
  selected?: boolean;
}

/**
 * Renders a diamond shaped icon for the timeline
 */
export function IconWithTransform(
  props: Omit<React.ComponentPropsWithRef<typeof Icon_>, "className" | "style">,
) {
  const { noDate, selected, status, ...rest } = props;

  return (
    <Icon_
      status={status}
      {...rest}
      {...stylex.props(
        noDate && !selected && status === Status.active
          ? styles.iconWithTransformNoDateNotSelectedStatusActive
          : undefined,
      )}
    />
  );
}

function Icon_(props: Props) {
  const { selected, noDate, ...etc } = props;
  return (
    <svg {...etc}>
      <circle cx="50" cy="50" r="40" stroke="green" strokeWidth="4" />
    </svg>
  );
}

export function App() {
  return (
    <div>
      <IconWithTeamColor $color="red">
        <circle cx="50" cy="50" r="40" stroke="green" strokeWidth="4" />
      </IconWithTeamColor>
      <IconWithTransform noDate selected status={Status.active} />
      <IconWithTransform noDate selected status={Status.inactive} />
      <IconWithTransform noDate status={Status.active} />
    </div>
  );
}

const styles = stylex.create({
  iconWithTeamColorFill: (fill: string) => ({
    fill,
  }),
  iconWithTransformNoDateNotSelectedStatusActive: {
    transform: "scale(0.66)",
  },
});
