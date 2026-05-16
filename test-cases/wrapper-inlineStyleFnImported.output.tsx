import * as stylex from "@stylexjs/stylex";
import { ExternalComponent } from "./lib/external-component";
import type { ImportedSizeProps } from "./lib/imported-size-props";

export function App() {
  return (
    <div>
      <ExternalComponent
        isOpen
        {...stylex.props(
          styles.external,
          styles.externalColor("blue"),
          styles.externalPadding("20px"),
        )}
      />
      <ExternalComponent isOpen={false} {...stylex.props(styles.external)} />
      <ExternalComponent isOpen {...stylex.props(styles.sizedExternalWidth(24))} />
      <ExternalComponent isOpen={false} />
    </div>
  );
}

const styles = stylex.create({
  // This uses styleFnFromProps pattern - prop value is directly used as style value
  external: {
    color: "gray",
    padding: "10px",
  },
  externalColor: (color: string) => ({
    color,
  }),
  externalPadding: (padding: string) => ({
    padding,
  }),
  sizedExternalWidth: (tabIndex: number | undefined) => ({
    width: tabIndex,
  }),
});
