// Wrapped component conditional: props used in interpolation must still pass through to inner component
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  variant: "default" | "active" | "muted";
  selected?: boolean;
  compact?: boolean;
}

function IconBase(props: IconProps) {
  const { variant, selected, compact, className, ...rest } = props;
  const fill = variant === "active" ? "blue" : variant === "muted" ? "gray" : "black";

  return (
    <svg {...rest} className={className} width="40" height="40" viewBox="0 0 40 40">
      <rect
        width="30"
        height="30"
        x="5"
        y="5"
        fill={fill}
        stroke={selected ? "orange" : "none"}
        strokeWidth={selected ? 3 : 0}
        rx={compact ? 2 : 8}
      />
    </svg>
  );
}

export function Icon(
  props: Omit<React.ComponentPropsWithRef<typeof IconBase>, "className" | "style">,
) {
  const { compact, selected, variant, ...rest } = props;
  return (
    <IconBase
      compact={compact}
      selected={selected}
      variant={variant}
      {...rest}
      {...stylex.props(
        compact && !selected && variant !== "active"
          ? styles.iconCompactNotSelectedVariantNotActive
          : undefined,
      )}
    />
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Icon variant="default" />
    <Icon variant="active" selected />
    <Icon variant="muted" compact />
    <Icon variant="default" compact selected />
  </div>
);

const styles = stylex.create({
  iconCompactNotSelectedVariantNotActive: {
    transform: "scale(0.66)",
  },
});
