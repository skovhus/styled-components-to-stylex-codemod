import * as React from "react";

// styled(Component) where the wrapped component accepts a StyleX `sx` prop.
// The codemod auto-detects sx support by walking the imported component's
// prop type signature (no adapter configuration required), so it emits
// `sx={styles.x}` instead of `{...stylex.props(styles.x)}` on the rendered
// wrapped component.
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import electronStyles from "./lib/electronMixins.module.css";
import { SxAwareButton } from "./lib/sx-aware-component";
// Generic component whose props type intersects an aliased object literal
// containing `sx?:` — exercises type-alias resolution + intersection walking.
import { Text } from "./lib/sx-aware-text";

// Single call site → inlined into JSX directly.
function StyledButton(props: React.ComponentPropsWithRef<typeof SxAwareButton>) {
  const { children, sx, ...rest } = props;
  return (
    <SxAwareButton {...rest} sx={[callerStyles.button, sx]}>
      {children}
    </SxAwareButton>
  );
}

// Exported wrapper with external `sx` support (per fixture adapter
// externalInterface). Even when the wrapped component accepts `sx`, the
// wrapper itself accepts an external `sx` prop and must compose it with the
// internal `styles.exportedAccent` style.
export function ExportedAccentButton(
  props: {
    className?: string;
    style?: React.CSSProperties;
    sx?: stylex.StyleXStyles;
  } & React.ComponentPropsWithRef<typeof SxAwareButton>,
) {
  const { children, sx, ...rest } = props;
  return (
    <SxAwareButton {...rest} sx={[callerStyles.exportedAccentButton, sx]}>
      {children}
    </SxAwareButton>
  );
}

type ExportedToggleButtonProps = {
  className?: string;
  style?: React.CSSProperties;
  sx?: stylex.StyleXStyles;
  open?: boolean;
} & Omit<React.ComponentPropsWithRef<typeof SxAwareButton>, "$open">;

export function ExportedToggleButton(props: ExportedToggleButtonProps) {
  const { children, sx, open, ...rest } = props;
  return (
    <SxAwareButton
      {...rest}
      type="button"
      sx={[
        callerStyles.exportedToggleButton,
        open ? callerStyles.exportedToggleButtonOpen : null,
        sx,
      ]}
    >
      {children}
    </SxAwareButton>
  );
}

export function DraggableSxButton(
  props: {
    className?: string;
    style?: React.CSSProperties;
    sx?: stylex.StyleXStyles;
  } & React.ComponentPropsWithRef<typeof SxAwareButton>,
) {
  const { className, children, style, sx, ...rest } = props;
  return (
    <SxAwareButton
      {...rest}
      {...mergedSx(
        [callerStyles.draggableSxButton, sx],
        [`${electronStyles.draggableRegionDisableChildren}`, className],
        style,
      )}
    >
      {children}
    </SxAwareButton>
  );
}

const callerStyles = stylex.create({
  caller: { textDecorationLine: "underline" },
  button: {
    color: "#bf4f74",
    fontWeight: "bold",
  },
  // Multiple call sites → emitted as a wrapper function component.
  primary: {
    color: "white",
  },
  // Single call site with caller-passed sx → tests inlined path composing
  // the caller's sx with the styled component's internal sx.
  inlinedAccent: {
    backgroundColor: "#fef3c7",
  },
  exportedAccentButton: {
    color: "red",
  },
  exportedToggleButton: {
    display: "inline-flex",
    backgroundColor: "#f8fafc",
  },
  exportedToggleButtonOpen: {
    backgroundColor: "#dbeafe",
  },
  draggableSxButton: {
    color: "#14532d",
  },
  // Wrapping the generic Text component — auto-detection has to walk
  // `TextComponentProps`'s intersection (TextProps & Omit<…> & { sx?: … }) to
  // find the `sx` member.
  text: {
    color: "navy",
    lineHeight: "20px",
  },
});

export const App = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 16, width: 480 }}>
    <StyledButton>Default</StyledButton>
    <StyledButton className="extra-class" style={{ marginTop: 4 }}>
      With external className/style
    </StyledButton>
    {/* Caller passes its own sx — must compose with the wrapper's internal sx */}
    <StyledButton sx={callerStyles.caller}>Caller sx</StyledButton>
    <SxAwareButton sx={callerStyles.primary}>Primary 1</SxAwareButton>
    <SxAwareButton sx={callerStyles.primary}>Primary 2</SxAwareButton>
    <SxAwareButton sx={[callerStyles.inlinedAccent, callerStyles.caller]}>
      Inlined with caller sx
    </SxAwareButton>
    <ExportedAccentButton>Exported</ExportedAccentButton>
    <ExportedAccentButton sx={callerStyles.caller}>Exported with caller sx</ExportedAccentButton>
    <ExportedToggleButton open sx={callerStyles.caller}>
      Exported toggle
    </ExportedToggleButton>
    <DraggableSxButton sx={callerStyles.caller}>Draggable sx</DraggableSxButton>
    <Text size="md" sx={callerStyles.text}>
      Generic Text
    </Text>
  </div>
);
