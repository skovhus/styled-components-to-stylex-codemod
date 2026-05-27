import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

type ContainerProps = {
  $open?: boolean;
  $delay?: number;
  children?: React.ReactNode;
};

const EASING = "cubic-bezier(0.25, 0.46, 0.45, 0.94)";

/**
 * Test case for transitionDelay with number value.
 * The codemod should convert number 0 to "0ms" string for CSS properties.
 */
function Container(
  props: ContainerProps & { sx?: stylex.StyleXStyles } & React.ComponentProps<"div">,
) {
  const { className, style, sx, $delay, $open, ...rest } = props;
  return (
    <div
      {...rest}
      {...mergedSx([styles.container, $open && styles.containerOpen($delay), sx], className, style)}
    />
  );
}

type DynamicTransitionPanelProps = React.PropsWithChildren<{
  visible?: boolean;
}>;

function DynamicTransitionPanel(props: DynamicTransitionPanelProps) {
  const { children, visible } = props;
  return (
    <div
      sx={[
        styles.dynamicTransitionPanel,
        visible && styles.dynamicTransitionPanelVisible,
        styles.dynamicTransitionPanelTransition(props),
      ]}
    >
      {children}
    </div>
  );
}

export function AutoFadingContainer(props: ContainerProps) {
  const { children, ...rest } = props;
  return <Container {...rest}>{children}</Container>;
}

export const App = () => {
  const [open, setOpen] = React.useState(true);

  React.useEffect(() => {
    const id = window.setInterval(() => setOpen((v) => !v), 1200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div style={{ display: "flex", gap: 12, fontFamily: "system-ui", fontSize: 14 }}>
      <AutoFadingContainer $open={open} $delay={0}>
        0ms delay
      </AutoFadingContainer>
      <AutoFadingContainer $open={open} $delay={200}>
        200ms delay
      </AutoFadingContainer>
      <AutoFadingContainer $open={open} $delay={600}>
        600ms delay
      </AutoFadingContainer>
      <DynamicTransitionPanel visible={open}>Dynamic shorthand</DynamicTransitionPanel>
    </div>
  );
};

const styles = stylex.create({
  container: {
    opacity: 0,
    transition: "opacity 200ms ease-out",
    transitionDelay: "0ms",
    backgroundColor: "#3b82f6",
    color: "white",
    paddingBlock: 16,
    paddingInline: 20,
    borderRadius: 8,
  },
  containerOpen: ($delay: number | undefined) => ({
    opacity: 1,
    transitionDelay: `${$delay}ms`,
  }),
  dynamicTransitionPanel: {
    opacity: 0,
    padding: 12,
    backgroundColor: "#fef3c7",
  },
  dynamicTransitionPanelVisible: {
    opacity: 1,
  },
  dynamicTransitionPanelTransition: (props: DynamicTransitionPanelProps) => ({
    transition: `opacity ${props.visible ? 400 : 100}ms ${EASING}`,
  }),
});
