// styled(Component) where the wrapped component accepts a StyleX `sx` prop.
// The codemod auto-detects sx support by walking the imported component's
// prop type signature (no adapter configuration required), so it emits
// `sx={styles.x}` instead of `{...stylex.props(styles.x)}` on the rendered
// wrapped component.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import styled, { css } from "styled-components";
import { draggableRegion } from "./lib/helpers";
import { SxAwareButton } from "./lib/sx-aware-component";
import type { ImportedFlexProps, ImportedWrapperSxProps } from "./lib/sx-aware-imported-types";
import type * as WrapperTypes from "./lib/sx-aware-imported-types";
import type { BarrelWrapperSxProps } from "./lib/sx-aware-wrapper-barrel";
import type { DefaultBarrelWrapperProps } from "./lib/sx-aware-wrapper-default-barrel";
import type DefaultWrapperProps from "./lib/sx-aware-wrapper-default-props";
import type LocalDefaultWrapperProps from "./lib/sx-aware-wrapper-local-default-props";
import DefaultSxButton from "./lib/sx-default-button";
import DefaultIdentifierSxButton from "./lib/sx-default-identifier-button";
import DirectorySxButton from "./lib/sx-directory-button";
import { NestedSxBox } from "./lib/sx-branchy-box";
// Generic component whose props type intersects an aliased object literal
// containing `sx?:` — exercises type-alias resolution + intersection walking.
import { ImportedIcon, ImportedTooltip, Text } from "./lib/sx-aware-text";

// Single call site → inlined into JSX directly.
const StyledButton = styled(SxAwareButton)`
  color: #bf4f74;
  font-weight: bold;
`;

// Media-only overrides forwarded through sx must keep SxAwareButton's base default.
const PrintButton = styled(SxAwareButton)`
  @media print {
    display: block;
  }
`;

// Default imports must infer the source declaration name when preserving sx defaults.
const DefaultPrintButton = styled(DefaultSxButton)`
  @media print {
    display: block;
  }
`;

// Default exports through identifiers must resolve the source declaration name.
const DefaultIdentifierPrintButton = styled(DefaultIdentifierSxButton)`
  @media print {
    display: block;
  }
`;

// Directory imports must continue probing to index.tsx when preserving sx defaults.
const DirectoryPrintButton = styled(DirectorySxButton)`
  @media print {
    display: block;
  }
`;

// Dynamic style functions forwarded through sx must preserve the wrapped base default.
const DynamicPrintButton = styled(SxAwareButton)<{ printDisplay: "block" | "inline-flex" }>`
  @media print {
    display: ${(props) => props.printDisplay};
  }
`;

// Nested forwarded sx defaults must preserve SxAwareButton's base defaults too.
const HoverMediaButton = styled(SxAwareButton)`
  &:hover {
    @media (hover: hover) {
      background-color: orange;
    }
  }
`;

// Nested functions that mention sx must not affect the wrapped component base proof.
const NestedPrintBox = styled(NestedSxBox)`
  @media print {
    display: block;
  }
`;

// Multiple call sites → emitted as a wrapper function component.
const StyledPrimary = styled(SxAwareButton)`
  color: white;
`;

// Single call site with caller-passed sx → tests inlined path composing
// the caller's sx with the styled component's internal sx.
const InlinedAccent = styled(SxAwareButton)`
  background-color: #fef3c7;
`;

// Non-transient props used for styling must still be forwarded to sx-aware wrapped components
// when the wrapped component explicitly accepts them.
const StyledActive = styled(SxAwareButton)<{ active?: boolean }>`
  color: ${(props) => (props.active ? "green" : "gray")};
`;

// Exported wrapper with external `sx` support (per fixture adapter
// externalInterface). Even when the wrapped component accepts `sx`, the
// wrapper itself accepts an external `sx` prop and must compose it with the
// internal `styles.exportedAccent` style.
export const ExportedAccentButton = styled(SxAwareButton)`
  color: red;
`;

export const ExportedToggleButton = styled(SxAwareButton).attrs({ type: "button" })<{
  $open?: boolean;
}>`
  display: inline-flex;
  background-color: ${(props) => (props.$open ? "#dbeafe" : "#f8fafc")};
`;

export const DraggableSxButton = styled(SxAwareButton)`
  color: #14532d;
  ${draggableRegion(true)};
`;

// Wrapping the generic Text component — auto-detection has to walk
// `TextComponentProps`'s intersection (TextProps & Omit<…> & { sx?: … }) to
// find the `sx` member.
const StyledText = styled(Text)`
  color: navy;
  line-height: 20px;
`;

// Non-exported Text wrapper should preserve base Text props while
// composing the generated styles through sx.
const Identifier = styled(Text)`
  min-width: var(--column-width);
  flex-shrink: 0;
`;

// ImportedIcon's public props are an imported type alias with an sx member.
// The detector must follow imported type references when deciding whether
// styled(ImportedIcon) should forward sx.
const StyledIcon = styled(ImportedIcon)`
  margin-left: 4px;
  color: #2563eb;
`;

// ImportedTooltip's public props go through a local alias that intersects an
// imported interface. This mirrors sx-aware wrappers whose sx support is
// inherited from shared prop interfaces.
const StyledTooltip = styled(ImportedTooltip)`
  align-items: center;
  min-width: 24px;
`;

const InterfaceBase = styled(SxAwareButton)`
  border-color: #c084fc;
`;

interface InterfaceWrapperProps extends React.ComponentProps<typeof InterfaceBase> {
  label?: string;
}

const InterfaceWrapper = styled(InterfaceBase)<InterfaceWrapperProps>`
  background-color: #f5f3ff;
`;

type ExplicitWrapperProps = {
  label?: string;
};

const ExplicitWrapper = styled(InterfaceBase)<ExplicitWrapperProps>`
  color: #4c1d95;
`;

type ImportedWrapperProps = ImportedWrapperSxProps & {
  label?: string;
};

const ImportedTypeWrapper = styled(InterfaceBase)<ImportedWrapperProps>`
  color: #6d28d9;
`;

type ImportedInterfaceWrapperProps = ImportedFlexProps & {
  label?: string;
};

const ImportedInterfaceWrapper = styled(InterfaceBase)<ImportedInterfaceWrapperProps>`
  color: #7c3aed;
`;

type NamespaceWrapperProps = WrapperTypes.ImportedWrapperSxProps & {
  label?: string;
};

const NamespaceTypeWrapper = styled(InterfaceBase)<NamespaceWrapperProps>`
  color: #9333ea;
`;

interface NamespaceInterfaceWrapperProps extends WrapperTypes.ImportedWrapperSxProps {
  label?: string;
}

const NamespaceInterfaceWrapper = styled(InterfaceBase)<NamespaceInterfaceWrapperProps>`
  color: #a855f7;
`;

type BarrelWrapperProps = BarrelWrapperSxProps & {
  label?: string;
};

const BarrelTypeWrapper = styled(InterfaceBase)<BarrelWrapperProps>`
  color: #c084fc;
`;

type DefaultImportedWrapperProps = DefaultWrapperProps & {
  label?: string;
};

const DefaultImportedTypeWrapper = styled(InterfaceBase)<DefaultImportedWrapperProps>`
  color: #d8b4fe;
`;

type DefaultBarrelWrapperLocalProps = DefaultBarrelWrapperProps & {
  label?: string;
};

const DefaultBarrelTypeWrapper = styled(InterfaceBase)<DefaultBarrelWrapperLocalProps>`
  color: #e9d5ff;
`;

type LocalDefaultWrapperLocalProps = LocalDefaultWrapperProps & {
  label?: string;
};

const LocalDefaultTypeWrapper = styled(InterfaceBase)<LocalDefaultWrapperLocalProps>`
  color: #f3e8ff;
`;

type OmitSxWrapperProps = Omit<React.ComponentProps<typeof InterfaceBase>, "sx"> & {
  label?: string;
};

const OmitSxWrapper = styled(InterfaceBase)<OmitSxWrapperProps>`
  color: #581c87;
`;

const callerStyles = stylex.create({
  caller: { textDecorationLine: "underline" },
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
    <PrintButton>Print display</PrintButton>
    <DefaultPrintButton>Default export print</DefaultPrintButton>
    <DefaultIdentifierPrintButton>Default identifier print</DefaultIdentifierPrintButton>
    <DirectoryPrintButton>Directory import print</DirectoryPrintButton>
    <DynamicPrintButton printDisplay="block">Dynamic print display</DynamicPrintButton>
    <HoverMediaButton>Hover media</HoverMediaButton>
    <NestedPrintBox>Nested sx scope</NestedPrintBox>
    <StyledPrimary>Primary 1</StyledPrimary>
    <StyledPrimary>Primary 2</StyledPrimary>
    <InlinedAccent sx={callerStyles.caller}>Inlined with caller sx</InlinedAccent>
    <StyledActive active>Active forwarded</StyledActive>
    <StyledActive>Inactive forwarded</StyledActive>
    <ExportedAccentButton>Exported</ExportedAccentButton>
    <ExportedAccentButton sx={callerStyles.caller}>Exported with caller sx</ExportedAccentButton>
    <ExportedToggleButton $open sx={callerStyles.caller}>
      Exported toggle
    </ExportedToggleButton>
    <DraggableSxButton sx={callerStyles.caller}>Draggable sx</DraggableSxButton>
    <StyledText size="md">Generic Text</StyledText>
    <StyledIcon color="currentColor" aria-label="Imported icon" />
    <StyledTooltip delay={100}>Imported tooltip</StyledTooltip>
    <InterfaceWrapper sx={callerStyles.caller}>Interface wrapper</InterfaceWrapper>
    <ImportedTypeWrapper sx={callerStyles.caller}>Imported type wrapper</ImportedTypeWrapper>
    <ImportedInterfaceWrapper sx={callerStyles.caller}>
      Imported interface wrapper
    </ImportedInterfaceWrapper>
    <NamespaceTypeWrapper sx={callerStyles.caller}>Namespace type wrapper</NamespaceTypeWrapper>
    <NamespaceInterfaceWrapper sx={callerStyles.caller}>
      Namespace interface wrapper
    </NamespaceInterfaceWrapper>
    <BarrelTypeWrapper sx={callerStyles.caller}>Barrel type wrapper</BarrelTypeWrapper>
    <DefaultImportedTypeWrapper sx={callerStyles.caller}>
      Default imported type wrapper
    </DefaultImportedTypeWrapper>
    <DefaultBarrelTypeWrapper sx={callerStyles.caller}>
      Default barrel type wrapper
    </DefaultBarrelTypeWrapper>
    <LocalDefaultTypeWrapper sx={callerStyles.caller}>
      Local default type wrapper
    </LocalDefaultTypeWrapper>
    <ExplicitWrapper sx={callerStyles.caller}>Explicit wrapper</ExplicitWrapper>
    <OmitSxWrapper>Omit sx wrapper</OmitSxWrapper>
    <div style={identifierRowStyle}>
      <Identifier color="labelMuted">ABC-123</Identifier>
      <span>Item title</span>
    </div>
  </div>
);
