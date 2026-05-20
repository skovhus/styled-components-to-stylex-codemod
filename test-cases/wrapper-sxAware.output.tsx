// styled(Component) where the wrapped component accepts a StyleX `sx` prop.
// The codemod auto-detects sx support by walking the imported component's
// prop type signature (no adapter configuration required), so it emits
// `sx={styles.x}` instead of `{...stylex.props(styles.x)}` on the rendered
// wrapped component.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import electronStyles from "./lib/electronMixins.module.css";
import { SxAwareButton } from "./lib/sx-aware-component";
import type { ImportedFlexProps, ImportedWrapperSxProps } from "./lib/sx-aware-imported-types";
import type * as WrapperTypes from "./lib/sx-aware-imported-types";
import type { BarrelWrapperSxProps } from "./lib/sx-aware-wrapper-barrel";
import type { DefaultBarrelWrapperProps } from "./lib/sx-aware-wrapper-default-barrel";
import type DefaultWrapperProps from "./lib/sx-aware-wrapper-default-props";
import type LocalDefaultWrapperProps from "./lib/sx-aware-wrapper-local-default-props";

// Generic component whose props type intersects an aliased object literal
// containing `sx?:` — exercises type-alias resolution + intersection walking.
import { ImportedIcon, ImportedTooltip, Text } from "./lib/sx-aware-text";

// Single call site → inlined into JSX directly.
function StyledButton(props: React.ComponentPropsWithRef<typeof SxAwareButton>) {
  const { children, sx, ...rest } = props;
  return (
    <SxAwareButton {...rest} sx={[callerStyles.button, sx]}>
      {children}
    </SxAwareButton>
  );
}

type StyledActiveProps = { active?: boolean } & Omit<
  React.ComponentPropsWithRef<typeof SxAwareButton>,
  "className" | "style"
>;

// Non-transient props used for styling must still be forwarded to sx-aware wrapped components
// when the wrapped component explicitly accepts them.
function StyledActive(props: StyledActiveProps) {
  const { children, sx, active, ...rest } = props;
  return (
    <SxAwareButton
      active={active}
      {...rest}
      sx={[callerStyles.active, active ? callerStyles.activeActive : null, sx]}
    >
      {children}
    </SxAwareButton>
  );
}

// Exported wrapper with external `sx` support (per fixture adapter
// externalInterface). Even when the wrapped component accepts `sx`, the
// wrapper itself accepts an external `sx` prop and must compose it with the
// internal `styles.exportedAccent` style.
export function ExportedAccentButton(props: React.ComponentPropsWithRef<typeof SxAwareButton>) {
  const { children, sx, ...rest } = props;
  return (
    <SxAwareButton {...rest} sx={[callerStyles.exportedAccentButton, sx]}>
      {children}
    </SxAwareButton>
  );
}

type ExportedToggleButtonProps = { open?: boolean } & Omit<
  React.ComponentPropsWithRef<typeof SxAwareButton>,
  "type" | "$open"
>;

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

export function DraggableSxButton(props: React.ComponentPropsWithRef<typeof SxAwareButton>) {
  const { className, children, style, sx, ...rest } = props;
  return (
    <SxAwareButton
      {...rest}
      className={[`${electronStyles.draggableRegionDisableChildren}`, className]
        .filter(Boolean)
        .join(" ")}
      style={style}
      sx={[callerStyles.draggableSxButton, sx]}
    >
      {children}
    </SxAwareButton>
  );
}

function InterfaceBase(props: React.ComponentPropsWithRef<typeof SxAwareButton>) {
  const { sx, ...rest } = props;
  return <SxAwareButton {...rest} sx={[callerStyles.interfaceBase, sx]} />;
}

interface InterfaceWrapperProps extends React.ComponentProps<typeof InterfaceBase> {
  label?: string;
}

type ExplicitWrapperProps = {
  label?: string;
};

type ImportedWrapperProps = ImportedWrapperSxProps & {
  label?: string;
};

type ImportedInterfaceWrapperProps = ImportedFlexProps & {
  label?: string;
};

type NamespaceWrapperProps = WrapperTypes.ImportedWrapperSxProps & {
  label?: string;
};

interface NamespaceInterfaceWrapperProps extends WrapperTypes.ImportedWrapperSxProps {
  label?: string;
}

type BarrelWrapperProps = BarrelWrapperSxProps & {
  label?: string;
};

type DefaultImportedWrapperProps = DefaultWrapperProps & {
  label?: string;
};

type DefaultBarrelWrapperLocalProps = DefaultBarrelWrapperProps & {
  label?: string;
};

type LocalDefaultWrapperLocalProps = LocalDefaultWrapperProps & {
  label?: string;
};

type OmitSxWrapperProps = Omit<React.ComponentProps<typeof InterfaceBase>, "sx"> & {
  label?: string;
};

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
  active: {
    color: "gray",
  },
  activeActive: {
    color: "green",
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
  // Non-exported Text wrapper should preserve base Text props while
  // composing the generated styles through sx.
  identifier: {
    minWidth: "var(--column-width)",
    flexShrink: 0,
  },
  // ImportedIcon's public props are an imported type alias with an sx member.
  // The detector must follow imported type references when deciding whether
  // styled(ImportedIcon) should forward sx.
  icon: {
    marginLeft: 4,
    color: "#2563eb",
  },
  // ImportedTooltip's public props go through a local alias that intersects an
  // imported interface. This mirrors sx-aware wrappers whose sx support is
  // inherited from shared prop interfaces.
  tooltip: {
    alignItems: "center",
    minWidth: 24,
  },
  interfaceBase: {
    borderColor: "#c084fc",
  },
  interfaceWrapper: {
    backgroundColor: "#f5f3ff",
  },
  explicitWrapper: {
    color: "#4c1d95",
  },
  importedTypeWrapper: {
    color: "#6d28d9",
  },
  importedInterfaceWrapper: {
    color: "#7c3aed",
  },
  namespaceTypeWrapper: {
    color: "#9333ea",
  },
  namespaceInterfaceWrapper: {
    color: "#a855f7",
  },
  barrelTypeWrapper: {
    color: "#c084fc",
  },
  defaultImportedTypeWrapper: {
    color: "#d8b4fe",
  },
  defaultBarrelTypeWrapper: {
    color: "#e9d5ff",
  },
  localDefaultTypeWrapper: {
    color: "#f3e8ff",
  },
  omitSxWrapper: {
    color: "#581c87",
  },
});

const identifierRowStyle = {
  "--column-width": "96px",
  display: "flex",
  gap: 8,
  padding: 8,
} satisfies React.CSSProperties & Record<"--column-width", string>;

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
    <StyledActive active>Active forwarded</StyledActive>
    <StyledActive>Inactive forwarded</StyledActive>
    <ExportedAccentButton>Exported</ExportedAccentButton>
    <ExportedAccentButton sx={callerStyles.caller}>Exported with caller sx</ExportedAccentButton>
    <ExportedToggleButton open sx={callerStyles.caller}>
      Exported toggle
    </ExportedToggleButton>
    <DraggableSxButton sx={callerStyles.caller}>Draggable sx</DraggableSxButton>
    <Text size="md" sx={callerStyles.text}>
      Generic Text
    </Text>
    <ImportedIcon color="currentColor" aria-label="Imported icon" sx={callerStyles.icon} />
    <ImportedTooltip delay={100} sx={callerStyles.tooltip}>
      Imported tooltip
    </ImportedTooltip>
    <SxAwareButton
      sx={[callerStyles.interfaceBase, callerStyles.interfaceWrapper, callerStyles.caller]}
    >
      Interface wrapper
    </SxAwareButton>
    <SxAwareButton
      sx={[callerStyles.interfaceBase, callerStyles.importedTypeWrapper, callerStyles.caller]}
    >
      Imported type wrapper
    </SxAwareButton>
    <SxAwareButton
      sx={[callerStyles.interfaceBase, callerStyles.importedInterfaceWrapper, callerStyles.caller]}
    >
      Imported interface wrapper
    </SxAwareButton>
    <SxAwareButton
      sx={[callerStyles.interfaceBase, callerStyles.namespaceTypeWrapper, callerStyles.caller]}
    >
      Namespace type wrapper
    </SxAwareButton>
    <SxAwareButton
      sx={[callerStyles.interfaceBase, callerStyles.namespaceInterfaceWrapper, callerStyles.caller]}
    >
      Namespace interface wrapper
    </SxAwareButton>
    <SxAwareButton
      sx={[callerStyles.interfaceBase, callerStyles.barrelTypeWrapper, callerStyles.caller]}
    >
      Barrel type wrapper
    </SxAwareButton>
    <SxAwareButton
      sx={[
        callerStyles.interfaceBase,
        callerStyles.defaultImportedTypeWrapper,
        callerStyles.caller,
      ]}
    >
      Default imported type wrapper
    </SxAwareButton>
    <SxAwareButton
      sx={[callerStyles.interfaceBase, callerStyles.defaultBarrelTypeWrapper, callerStyles.caller]}
    >
      Default barrel type wrapper
    </SxAwareButton>
    <SxAwareButton
      sx={[callerStyles.interfaceBase, callerStyles.localDefaultTypeWrapper, callerStyles.caller]}
    >
      Local default type wrapper
    </SxAwareButton>
    <SxAwareButton
      sx={[callerStyles.interfaceBase, callerStyles.explicitWrapper, callerStyles.caller]}
    >
      Explicit wrapper
    </SxAwareButton>
    <SxAwareButton sx={[callerStyles.interfaceBase, callerStyles.omitSxWrapper]}>
      Omit sx wrapper
    </SxAwareButton>
    <div style={identifierRowStyle}>
      <Text color="labelMuted" sx={callerStyles.identifier}>
        ABC-123
      </Text>
      <span>Item title</span>
    </div>
  </div>
);
