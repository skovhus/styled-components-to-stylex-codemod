import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { ExternalComponent } from "./lib/external-component";

type StyledExternalProps = React.ComponentPropsWithRef<typeof ExternalComponent> & {
  $color?: string;
};

// Spread props require wrapper - styleFn values can't be extracted at transform time
function StyledExternal(props: StyledExternalProps) {
  const { className, style, $color, ...rest } = props;

  return (
    <ExternalComponent
      {...rest}
      {...mergedSx(
        [styles.styledExternal, props.$color != null && styles.styledExternalColor(props.$color)],
        className,
        style,
      )}
    />
  );
}

export function App(props: { $color?: string; isOpen: boolean }) {
  return <StyledExternal {...props} />;
}

const styles = stylex.create({
  styledExternal: {
    color: "gray",
    padding: "10px",
  },
  styledExternalColor: (color: string) => ({
    color,
  }),
});
