import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { ExternalComponent } from "./lib/external-component";

type StyledExternalProps = { $color?: string } & React.ComponentPropsWithRef<
  typeof ExternalComponent
>;

// Spread props require wrapper - styleFn values can't be extracted at transform time
function StyledExternal(props: StyledExternalProps) {
  const { className, style, $color, ...rest } = props;

  return (
    <ExternalComponent
      {...rest}
      {...mergedSx(
        [styles.external, props.$color != null && styles.externalColor(props.$color)],
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
  external: {
    color: "gray",
    padding: "10px",
  },
  externalColor: (color: string) => ({
    color,
  }),
});
