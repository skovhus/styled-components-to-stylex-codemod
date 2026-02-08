import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Ternary conditionals inside pseudo selectors using css helper.
// Both branches of the inner ternary are statically resolvable,
// so we can create pseudo-wrapped conditional variants.

const OFFSET = 24;

interface Props {
  $collapsed: boolean;
  $enabled: boolean;
}

type ContainerProps = React.PropsWithChildren<Props>;

function Container(props: ContainerProps) {
  const { children, $collapsed, $enabled } = props;

  return (
    <div
      {...stylex.props(
        styles.container,
        $enabled ? styles.containerEnabled : undefined,
        $enabled && $collapsed ? styles.containerEnabledCollapsed : undefined,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: "12px", padding: "12px" }}>
    <Container $collapsed={false} $enabled={true}>
      Enabled, Not Collapsed
    </Container>
    <Container $collapsed={true} $enabled={true}>
      Enabled, Collapsed
    </Container>
    <Container $collapsed={false} $enabled={false}>
      Disabled
    </Container>
  </div>
);

const styles = stylex.create({
  container: {
    position: "relative",
    padding: "20px",
    backgroundColor: "#f5f5f5",
  },
  containerEnabled: {
    left: {
      default: null,
      ":hover": `${OFFSET}px`,
    },
    opacity: {
      default: null,
      ":hover": 0.8,
    },
  },
  containerEnabledCollapsed: {
    left: {
      default: null,
      ":hover": "0px",
    },
  },
});
