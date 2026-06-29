import * as React from "react";
import styled from "styled-components";
import { focusOutline } from "./lib/helpers";
import { Icon } from "./lib/icon";
import type { ImportedSectionProps } from "./lib/attrs-props";
import { SxAwareButton } from "./lib/sx-aware-component";

const attrsMarkerStyle = {};

// Simulated imported component
const Flex = (
  props: React.ComponentProps<"div"> & { column?: boolean; center?: boolean; focusIndex?: number },
) => {
  const { column, center, focusIndex, ...rest } = props;
  return <div data-focus-index={focusIndex} {...rest} />;
};

const Text = (
  props: React.ComponentProps<"section"> & {
    focusIndex?: number;
    otherAttribute?: boolean;
    someAttribute?: boolean;
  },
) => {
  const { focusIndex, otherAttribute, someAttribute, ...rest } = props;
  return (
    <section
      data-focus-index={focusIndex}
      data-other-attribute={otherAttribute ? "true" : "false"}
      data-some-attribute={someAttribute ? "true" : "false"}
      {...rest}
    />
  );
};

export interface SectionProps {
  someAttribute?: boolean;
  label?: string;
}

interface HighlightSectionProps {
  someAttribute?: boolean;
  $active?: boolean;
}

type UtilitySectionProps = React.PropsWithChildren<{
  someAttribute?: boolean;
  tone?: "info" | "success";
}>;

interface SharedSectionProps {
  someAttribute?: boolean;
  tone?: "primary" | "secondary";
}

type PickSectionBaseProps = {
  label?: string;
  someAttribute?: boolean;
};

type PickSectionProps = Pick<PickSectionBaseProps, "label" | "someAttribute">;

interface InheritedSectionProps extends ImportedSectionProps {
  localLabel?: string;
}

type UnionSectionProps =
  | { children?: React.ReactNode; kind: "alpha"; onlyAlpha?: number; someAttribute?: boolean }
  | { children?: React.ReactNode; kind: "beta"; onlyBeta?: string; someAttribute?: boolean };

type UtilityWrappedUnionSectionProps = React.PropsWithChildren<UnionSectionProps>;

type TransientUnionSectionProps =
  | { children?: React.ReactNode; kind: "alpha"; $tone?: "warm"; label?: string }
  | { children?: React.ReactNode; kind: "beta"; $tone?: "cool"; label?: string };

type TransientUnionExtraProps = {
  detail?: string;
};

const noop = () => undefined;

interface MethodSectionProps {
  label?: string;
  onClick?(): void;
}

interface SharedTransientSectionProps {
  $active?: boolean;
  label?: string;
}

// Pattern 1: styled.input.attrs (dot notation)
const Input = styled.input.attrs<{ $padding?: string; $small?: boolean }>((props) => ({
  type: "text",
  size: props.$small ? 5 : undefined,
}))`
  border-radius: 3px;
  border: 1px solid #bf4f74;
  display: block;
  margin: 0 0 1em;
  padding: ${(props) => props.$padding};

  &::placeholder {
    color: #bf4f74;
  }
`;

// Pattern 2: styled("input").attrs (function call + attrs)
export interface TextInputProps {
  allowPMAutofill?: boolean;
  // Data attribute used by 1Password to control autofill behavior
  "data-1p-ignore"?: boolean;
}

export const TextInput = styled("input").attrs<TextInputProps>((props) => ({
  "data-1p-ignore": props.allowPMAutofill !== true,
}))<TextInputProps>`
  height: 32px;
  padding: 8px;
  background: white;
`;

// Pattern 3: styled(Component).attrs with object
// This pattern passes static attrs as an object
interface BackgroundProps {
  loaded: boolean;
}

export const Background = styled(Flex).attrs({
  column: true,
  center: true,
})<BackgroundProps>`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${(props) => (props.loaded ? 0 : 1)};
`;

// Pattern 3b: attrs-injected component props should be omitted from the wrapper type
export const Section = styled(Text).attrs({ someAttribute: true })<SectionProps>`
  padding: 16px 16px;
  background-color: #f0f9ff;
`;

// Pattern 3c: imported explicit attrs props should be omitted even when unresolved
export const ImportedSection = styled(Text).attrs({ someAttribute: true })<ImportedSectionProps>`
  padding: 12px;
  background-color: #ecfdf5;
`;

// Pattern 3d: transient prop renames should still apply when explicit props overlap attrs
export const HighlightSection = styled(Text).attrs({
  someAttribute: true,
})<HighlightSectionProps>`
  color: ${(props) => (props.$active ? "#1d4ed8" : "#64748b")};
`;

// Pattern 3e: utility-wrapped explicit attrs props should be omitted from the local alias
export const UtilitySection = styled(Text).attrs({ someAttribute: true })<UtilitySectionProps>`
  padding: 10px;
  background-color: ${(props) => (props.tone === "success" ? "#dcfce7" : "#dbeafe")};
`;

// Pattern 3f: shared explicit aliases must not be mutated by attrs omission
export const SharedAttrsSection = styled(Text).attrs({ someAttribute: true })<SharedSectionProps>`
  padding: 14px;
  background-color: #fef3c7;
`;

export const SharedPlainSection = styled(Text)<SharedSectionProps>`
  color: ${(props) => (props.tone === "secondary" ? "#7c2d12" : "#1e3a8a")};
`;

// Pattern 3g: unresolved imported props inside intersections should still omit attrs props
export const ImportedIntersectionSection = styled(Text).attrs({
  someAttribute: true,
})<ImportedSectionProps & { localLabel?: string }>`
  padding: 6px;
  background-color: #fdf2f8;
`;

// Pattern 3h: dynamic attrs emitted after rest should omit the overwritten target prop
export const FocusIndexSection = styled(Text).attrs((props: { focusIndex?: number }) => ({
  tabIndex: props.focusIndex,
}))<{ focusIndex?: number }>`
  color: #334155;
`;

// Pattern 3i: utility aliases that cannot be mutated should keep wrapper-specific attrs Omit
export const PickSection = styled(Text).attrs({ someAttribute: true })<PickSectionProps>`
  padding: 18px;
  background-color: #eef2ff;
`;

// Pattern 3j: unresolved intersections should omit all attrs, including attrs hidden in imports
export const MultiImportedSection = styled(Text).attrs({
  otherAttribute: true,
  someAttribute: true,
})<ImportedSectionProps & { someAttribute?: boolean }>`
  padding: 20px;
  background-color: #f0fdf4;
`;

// Pattern 3k: local interfaces with imported heritage should keep wrapper-specific attrs Omit
export const InheritedSection = styled(Text).attrs({ someAttribute: true })<InheritedSectionProps>`
  padding: 22px;
  background-color: #fff7ed;
`;

// Pattern 3l: union aliases should keep wrapper-specific attrs Omit when not mutated
export const UnionSection = styled(Text).attrs({ someAttribute: true })<UnionSectionProps>`
  padding: 24px;
  background-color: #f8fafc;
`;

export const UtilityWrappedUnionSection = styled(Text).attrs({
  someAttribute: true,
})<UtilityWrappedUnionSectionProps>`
  padding: 25px;
  background-color: #f1f5f9;
`;

export const TransientUnionSection = styled(Text)<
  TransientUnionSectionProps & TransientUnionExtraProps
>`
  color: ${(props) => (props.$tone === "warm" ? "#9f1239" : "#1d4ed8")};
`;

// Pattern 3m: method-signature attrs props should be omitted from explicit interfaces
export const MethodSection = styled(Text).attrs({ onClick: noop })<MethodSectionProps>`
  padding: 26px;
  background-color: #eff6ff;
`;

// Pattern 3n: shared transient aliases should keep shared alias and remap wrapper-local props
export const SharedTransientAttrsSection = styled(Text).attrs({
  someAttribute: true,
})<SharedTransientSectionProps>`
  color: ${(props) => (props.$active ? "#0f766e" : "#475569")};
`;

export const SharedTransientPlainSection = styled(Text)<SharedTransientSectionProps>`
  background-color: ${(props) => (props.$active ? "#ccfbf1" : "#f8fafc")};
`;

// Pattern 4: styled(Component).attrs with function (from Scrollable.tsx)
// This pattern computes attrs from props
interface ScrollableProps {
  gutter?: string;
}

export const Scrollable = styled(Flex).attrs((props) => ({
  tabIndex: props.tabIndex ?? 0,
}))<ScrollableProps>`
  overflow-y: auto;
  position: relative;
`;

// Pattern 5: styled(Component).attrs with TYPE ALIAS (not interface)
// This is the exact pattern from a design system's Scrollable.tsx
type TypeAliasProps = {
  /** Whether scrollbar gutter should be stable */
  gutter?: "auto" | "stable" | string;
  /** Whether to apply background color */
  $applyBackground?: boolean;
};

export const ScrollableWithType = styled(Flex).attrs((props) => ({
  tabIndex: props.tabIndex ?? 0,
}))<TypeAliasProps>`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`;

// Pattern 6: defaultAttrs with different prop name than attr name
// When jsxProp !== attrName, the source prop must still be forwarded to the wrapped component
// E.g., tabIndex: props.focusIndex ?? 0 means focusIndex should still be passed through
interface FocusableProps {
  focusIndex?: number;
}

export const FocusableScroll = styled(Flex).attrs((props) => ({
  tabIndex: props.focusIndex ?? 0,
}))<FocusableProps>`
  overflow-y: auto;
`;

// Pattern 7: styled.div.attrs with prop reference (native element)
// When an intrinsic element has defaultAttrs, it generates a wrapper component
// that destructures the referenced prop and applies the default value
const Box = styled.div.attrs((props) => ({
  tabIndex: props.tabIndex ?? 0,
}))`
  overflow: auto;
`;

// Pattern 8: defaultAttrs with same-name prop that IS in base component's explicit props
// Verifies no duplication when attrName === jsxProp and prop is in baseExplicitProps
export const AlignedFlex = styled(Flex).attrs((props) => ({
  column: props.column ?? true,
}))<{}>`
  align-items: center;
`;

// Pattern 9: static attrs with a style object
// The inline style properties should be preserved in the output
const NoWrapText = styled.span.attrs({
  style: {
    whiteSpace: "nowrap" as const,
  },
})`
  color: blue;
`;

// Pattern 10: dynamic attrs with computed style object
// The dynamic inline styles should be preserved as inline style prop
const DynamicHeightBox = styled.div.attrs<{ $height: number }>(({ $height }) => ({
  style: {
    height: $height ? `${$height}px` : undefined,
  },
}))`
  display: flex;
  align-items: center;
`;

// Pattern 11: dynamic attrs style must be applied as style, not leaked as an inert DOM prop
const PositionedTile = styled.div.attrs<{ height: number }>((props) => ({
  style: {
    height: props.height,
  },
}))`
  position: absolute;
  min-height: 1px;
  background-color: #eef2ff;

  &:focus-visible {
    ${focusOutline};
    outline-offset: 3px;
  }
`;

// Pattern 11b: optional direct attrs style values should be omitted when undefined
const OptionalHeightBox = styled.div.attrs<{ height?: number }>((props) => ({
  style: {
    height: props.height,
  },
}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fee2e2;
`;

const MixedFallbackHeightBox = styled.div.attrs<{ height?: number }>((props) => ({
  style: {
    height: props.height ?? "16px",
  },
}))`
  display: flex;
  align-items: center;
  padding: 4px;
  background-color: #fef3c7;
`;

// Pattern 12: dynamic attrs style should merge with caller style, with caller style last
const SeparatorLine = styled.div.attrs<{ $height?: number }>((props) => ({
  style: {
    height: props.$height ?? 1,
  },
}))`
  width: 100%;
  background-color: #94a3b8;
`;

const FallbackSeparatorLine = styled.div.attrs<{ $height?: number }>(({ $height }) => ({
  style: {
    height: $height ? `${$height}px` : "16px",
  },
}))`
  width: 100%;
  background-color: #16a34a;
`;

function HeaderSeparator(props: {
  className?: string;
  height?: number;
  style?: React.CSSProperties;
}) {
  const { className, height, style } = props;
  return <SeparatorLine $height={height} className={className} style={style} />;
}

// Pattern 13: attrs on a base wrapper must be inherited by styled extensions
type ButtonLikeProps = React.PropsWithChildren<{
  className?: string;
  size?: "small" | "medium";
  style?: React.CSSProperties;
  variant?: "borderless" | "solid";
}>;

function ButtonLike(props: ButtonLikeProps) {
  const { children, className, size, style, variant } = props;
  return (
    <button className={className} data-size={size} data-variant={variant} style={style}>
      {children}
    </button>
  );
}

const BaseToolbarButton = styled(ButtonLike).attrs({
  size: "small",
  variant: "borderless",
})`
  padding: 4px 8px;
`;

const ActiveToolbarButton = styled(BaseToolbarButton)`
  color: #4338ca;
  background-color: #e0e7ff;
`;

// Pattern 14: attrs style identifiers from module scope must not be treated as props
const MODULE_SCOPE_TEXT_COLOR = "#0f766e";

const ModuleScopeStyleText = styled.span.attrs({
  style: {
    color: MODULE_SCOPE_TEXT_COLOR,
  },
})`
  font-weight: 600;
`;

const CALLBACK_SCOPE_TEXT_COLOR = "#7c3aed";

const CallbackScopeStyleText = styled.span.attrs(() => ({
  style: {
    color: CALLBACK_SCOPE_TEXT_COLOR,
  },
}))`
  font-style: italic;
`;

// Pattern 15: static attrs that reference module-scope values must be preserved
const iconSize = 14;

const StyledIcon = styled(Icon).attrs({
  size: iconSize,
})`
  position: relative;
  left: -3px;
`;

const AttrsSxButton = styled(SxAwareButton).attrs({
  sx: attrsMarkerStyle,
  type: "button",
})`
  color: #2563eb;
`;

// Pattern 16: static attrs with template literal containing escape sequences
// The cooked value (with actual newline) must be used, not the raw source text
const EscapedTemplateTitle = styled.div.attrs({
  title: `Line1\nLine2`,
})`
  padding: 8px;
  background-color: #fdf4ff;
`;

// Pattern 16b: static attrs with regular template literal (no escapes)
const PlainTemplateTitle = styled.div.attrs({
  title: `Plain template`,
})`
  padding: 8px;
  background-color: #fff1f2;
`;

// Pattern 17: static attrs with object/array values must be preserved (not dropped).
// For object-form attrs, styled-components evaluates the literals once, so they are
// hoisted to stable module-scope consts to keep the reference identity that memoized
// children / effects may rely on. Function-form attrs (Pattern 17b) re-run each render,
// so their literals stay inline.
function Motion(props: {
  className?: string;
  initial?: string;
  animate?: string;
  transition?: { duration: number };
  keyframes?: number[];
  children?: React.ReactNode;
}) {
  const { className, initial, animate, transition, keyframes, children } = props;
  return (
    <div
      className={className}
      data-initial={initial}
      data-animate={animate}
      data-duration={transition?.duration}
      data-keyframes={keyframes?.join(",")}
    >
      {children}
    </div>
  );
}

const AnimatedBox = styled(Motion).attrs({
  initial: "hidden",
  animate: "visible",
  transition: { duration: 0.2 },
  keyframes: [0, 0.5, 1],
})`
  padding: 8px;
  background-color: #ede9fe;
  color: #5b21b6;
`;

// Pattern 17b: function-form attrs re-run every render, so object/array literals are
// already fresh per render — they must stay inline (no module-scope hoisting).
const FadeBox = styled(Motion).attrs(() => ({
  initial: "fade-in",
  transition: { duration: 0.4 },
}))`
  padding: 8px;
  background-color: #fae8ff;
  color: #86198f;
`;

export const App = () => (
  <>
    <Input $small placeholder="Small" />
    <Input placeholder="Normal" />
    <Input $padding="2em" placeholder="Padded" />
    <TextInput placeholder="Text input" />
    <Background loaded={false}>Content</Background>
    <Section label="section-label">Section content</Section>
    <ImportedSection label="imported-section-label">Imported section content</ImportedSection>
    <HighlightSection $active>Highlighted section content</HighlightSection>
    <UtilitySection tone="success">Utility section content</UtilitySection>
    <SharedAttrsSection tone="primary">Shared attrs section content</SharedAttrsSection>
    <SharedPlainSection someAttribute={false} tone="secondary">
      Shared plain section content
    </SharedPlainSection>
    <ImportedIntersectionSection localLabel="local-label">
      Imported intersection section content
    </ImportedIntersectionSection>
    <FocusIndexSection focusIndex={2}>Focus index section content</FocusIndexSection>
    <PickSection label="pick-label">Pick section content</PickSection>
    <MultiImportedSection label="multi-label">Multi imported section content</MultiImportedSection>
    <InheritedSection localLabel="inherited-label">Inherited section content</InheritedSection>
    <UnionSection kind="alpha" onlyAlpha={1}>
      Union section content
    </UnionSection>
    <UtilityWrappedUnionSection kind="beta" onlyBeta="utility">
      Utility wrapped union section content
    </UtilityWrappedUnionSection>
    <TransientUnionSection detail="branch" kind="alpha" $tone="warm">
      Transient union section content
    </TransientUnionSection>
    <MethodSection label="method-label">Method section content</MethodSection>
    <SharedTransientAttrsSection $active label="shared-transient-attrs">
      Shared transient attrs section content
    </SharedTransientAttrsSection>
    <SharedTransientPlainSection $active label="shared-transient-plain">
      Shared transient plain section content
    </SharedTransientPlainSection>
    <Scrollable>Scrollable content</Scrollable>
    <ScrollableWithType gutter="stable">Type alias scrollable</ScrollableWithType>
    <FocusableScroll focusIndex={5}>Focus content</FocusableScroll>
    <Box>Box content</Box>
    <AlignedFlex>Aligned content</AlignedFlex>
    <NoWrapText>No wrapping text</NoWrapText>
    <DynamicHeightBox $height={50}>Dynamic height</DynamicHeightBox>
    <PositionedTile height={64}>Tile with attrs height</PositionedTile>
    <OptionalHeightBox>Optional height omitted</OptionalHeightBox>
    <OptionalHeightBox height={24}>Optional height set</OptionalHeightBox>
    <MixedFallbackHeightBox>Mixed fallback height</MixedFallbackHeightBox>
    <HeaderSeparator height={2} style={{ opacity: 1 }} />
    <FallbackSeparatorLine $height={4}>Fallback separator</FallbackSeparatorLine>
    <ActiveToolbarButton>Inherited attrs</ActiveToolbarButton>
    <ModuleScopeStyleText>Module scope style</ModuleScopeStyleText>
    <CallbackScopeStyleText>Callback scope style</CallbackScopeStyleText>
    <StyledIcon title="Attrs icon size" />
    <AttrsSxButton>Attrs sx</AttrsSxButton>
    <EscapedTemplateTitle>Escaped template title (hover to see)</EscapedTemplateTitle>
    <PlainTemplateTitle>Plain template title (hover to see)</PlainTemplateTitle>
    <AnimatedBox>Animated box</AnimatedBox>
    <FadeBox>Fade box</FadeBox>
  </>
);
