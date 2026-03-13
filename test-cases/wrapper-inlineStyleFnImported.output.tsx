import * as stylex from "@stylexjs/stylex";
import { ExternalComponent } from "./lib/external-component";

export function App() {
  return (
    <div>
      <ExternalComponent
        isOpen
        {...stylex.props(
          styles.external,
          styles.externalColor({
            color: "blue",
          }),
          styles.externalPadding({
            padding: "20px",
          }),
        )}
      />
      <ExternalComponent isOpen={false} {...stylex.props(styles.external)} />
    </div>
  );
}

const styles = stylex.create({
  // This uses styleFnFromProps pattern - prop value is directly used as style value
  external: {
    color: "gray",
    padding: "10px",
  },
  externalColor: (props: { color: string }) => ({
    color: props.color,
  }),
  externalPadding: (props: { padding: string }) => ({
    padding: props.padding,
  }),
});
