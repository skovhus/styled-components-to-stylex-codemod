import * as stylex from "@stylexjs/stylex";
import { ExternalComponent } from "./lib/external-component";

export function App() {
  return (
    <div>
      <ExternalComponent
        isOpen
        {...stylex.props(
          styles.styledExternal,
          styles.styledExternalColor("blue"),
          styles.styledExternalPadding("20px"),
        )}
      />
      <ExternalComponent isOpen={false} {...stylex.props(styles.styledExternal)} />
    </div>
  );
}

const styles = stylex.create({
  // This uses styleFnFromProps pattern - prop value is directly used as style value
  styledExternal: {
    color: "gray",
    padding: "10px",
  },
  styledExternalColor: (color: string) => ({
    color,
  }),

  styledExternalPadding: (padding: string) => ({
    padding,
  }),
});
