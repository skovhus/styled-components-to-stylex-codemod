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
// Bug: Codemod generates `$color && styles.fill($color)` which:
// - Returns "" (empty string) when $color is ""
// - Returns false when $color is undefined
// - Neither "" nor false are valid stylex.props() arguments
// This causes: TS2345: Argument of type '"" | readonly [...] | undefined'
//              is not assignable to parameter of type 'StyleXArray<...>'
export function IconWithTeamColor(props: IconWithTeamColorProps) {
  const { children, $color } = props;

  const sx = stylex.props($color ? styles.iconWithTeamColorFill($color) : undefined);

  return (
    <svg {...sx} className={["color-override", sx.className].filter(Boolean).join(" ")}>
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
          ? styles.iconWithTransformCondTruthy
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
  iconWithTransformCondTruthy: {
    transform: "scale(0.66)",
  },
});
