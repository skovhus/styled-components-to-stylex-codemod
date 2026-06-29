import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
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

export interface SectionProps extends Omit<
  React.ComponentPropsWithRef<typeof Text>,
  "className" | "style" | "someAttribute"
> {
  label?: string;
}

interface HighlightSectionProps extends Omit<
  React.ComponentPropsWithRef<typeof Text>,
  "className" | "style" | "someAttribute"
> {
  active?: boolean;
}

type UtilitySectionProps = React.PropsWithChildren<{
  tone?: "info" | "success";
}> &
  Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style" | "someAttribute">;

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

interface MethodSectionProps extends Omit<
  React.ComponentPropsWithRef<typeof Text>,
  "className" | "style" | "onClick"
> {
  label?: string;
}

interface SharedTransientSectionProps {
  active?: boolean;
  label?: string;
}

type InputProps = {
  padding?: string;
  small?: boolean;
} & Omit<React.ComponentProps<"input">, "className" | "style" | "sx">;

// Pattern 1: styled.input.attrs (dot notation)
function Input(props: InputProps) {
  const { padding, small, ...rest } = props;
  return (
    <input
      size={small ? 5 : undefined}
      type="text"
      {...rest}
      sx={[styles.input, padding != null && styles.inputPadding(padding)]}
    />
  );
}

// Pattern 2: styled("input").attrs (function call + attrs)
export interface TextInputProps {
  allowPMAutofill?: boolean;
  // Data attribute used by 1Password to control autofill behavior
  "data-1p-ignore"?: boolean;
}

export function TextInput(
  props: TextInputProps & Omit<React.ComponentProps<"input">, "className" | "style" | "sx">,
) {
  const { allowPMAutofill, ...rest } = props;
  return <input data-1p-ignore={allowPMAutofill !== true} {...rest} sx={styles.textInput} />;
}

// Pattern 3: styled(Component).attrs with object
// This pattern passes static attrs as an object
interface BackgroundProps extends Omit<
  React.ComponentPropsWithRef<typeof Flex>,
  "className" | "style" | "column" | "center"
> {
  loaded: boolean;
}

export function Background(props: BackgroundProps) {
  const { loaded, ...rest } = props;
  return (
    <Flex
      {...rest}
      column={true}
      center={true}
      {...stylex.props(styles.background, loaded && styles.backgroundLoaded)}
    />
  );
}

// Pattern 3b: attrs-injected component props should be omitted from the wrapper type
export function Section(props: SectionProps) {
  return <Text {...props} someAttribute={true} {...stylex.props(styles.section)} />;
}

// Pattern 3c: imported explicit attrs props should be omitted even when unresolved
export function ImportedSection(
  props: Omit<ImportedSectionProps, "someAttribute"> &
    Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style" | "someAttribute">,
) {
  return <Text {...props} someAttribute={true} {...stylex.props(styles.importedSection)} />;
}

// Pattern 3d: transient prop renames should still apply when explicit props overlap attrs
export function HighlightSection(props: HighlightSectionProps) {
  const { active, ...rest } = props;
  return (
    <Text
      {...rest}
      someAttribute={true}
      {...stylex.props(styles.highlightSection, active ? styles.highlightSectionActive : undefined)}
    />
  );
}

// Pattern 3e: utility-wrapped explicit attrs props should be omitted from the local alias
export function UtilitySection(props: UtilitySectionProps) {
  const { tone, ...rest } = props;
  return (
    <Text
      {...rest}
      someAttribute={true}
      {...stylex.props(
        styles.utilitySection,
        tone === "success" && styles.utilitySectionToneSuccess,
      )}
    />
  );
}

// Pattern 3f: shared explicit aliases must not be mutated by attrs omission
export function SharedAttrsSection(
  props: Omit<SharedSectionProps, "someAttribute"> &
    Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style" | "someAttribute">,
) {
  return <Text {...props} someAttribute={true} {...stylex.props(styles.sharedAttrsSection)} />;
}

type SharedPlainSectionProps = SharedSectionProps &
  Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style">;

export function SharedPlainSection(props: SharedPlainSectionProps) {
  const { tone, ...rest } = props;
  return (
    <Text
      {...rest}
      {...stylex.props(
        styles.sharedPlainSection,
        tone === "secondary" && styles.sharedPlainSectionToneSecondary,
      )}
    />
  );
}

type ImportedIntersectionSectionProps = Omit<
  ImportedSectionProps & {
    localLabel?: string;
  },
  "someAttribute"
> &
  Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style" | "someAttribute">;

// Pattern 3g: unresolved imported props inside intersections should still omit attrs props
export function ImportedIntersectionSection(props: ImportedIntersectionSectionProps) {
  return (
    <Text {...props} someAttribute={true} {...stylex.props(styles.importedIntersectionSection)} />
  );
}

type FocusIndexSectionProps = { focusIndex?: number } & Omit<
  React.ComponentPropsWithRef<typeof Text>,
  "className" | "style" | "tabIndex"
>;

// Pattern 3h: dynamic attrs emitted after rest should omit the overwritten target prop
export function FocusIndexSection(props: FocusIndexSectionProps) {
  const { focusIndex, ...rest } = props;
  return (
    <Text
      focusIndex={focusIndex}
      {...rest}
      tabIndex={focusIndex}
      {...stylex.props(styles.focusIndexSection)}
    />
  );
}

// Pattern 3i: utility aliases that cannot be mutated should keep wrapper-specific attrs Omit
export function PickSection(
  props: Omit<PickSectionProps, "someAttribute"> &
    Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style" | "someAttribute">,
) {
  return <Text {...props} someAttribute={true} {...stylex.props(styles.pickSection)} />;
}

type MultiImportedSectionProps = Omit<
  ImportedSectionProps & {
    someAttribute?: boolean;
  },
  "otherAttribute" | "someAttribute"
> &
  Omit<
    React.ComponentPropsWithRef<typeof Text>,
    "className" | "style" | "otherAttribute" | "someAttribute"
  >;

// Pattern 3j: unresolved intersections should omit all attrs, including attrs hidden in imports
export function MultiImportedSection(props: MultiImportedSectionProps) {
  return (
    <Text
      {...props}
      otherAttribute={true}
      someAttribute={true}
      {...stylex.props(styles.multiImportedSection)}
    />
  );
}

// Pattern 3k: local interfaces with imported heritage should keep wrapper-specific attrs Omit
export function InheritedSection(
  props: Omit<InheritedSectionProps, "someAttribute"> &
    Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style" | "someAttribute">,
) {
  return <Text {...props} someAttribute={true} {...stylex.props(styles.inheritedSection)} />;
}

// Pattern 3l: union aliases should keep wrapper-specific attrs Omit when not mutated
export function UnionSection(
  props: (UnionSectionProps extends infer T
    ? T extends unknown
      ? Omit<T, "someAttribute">
      : never
    : never) &
    Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style" | "someAttribute">,
) {
  return <Text {...props} someAttribute={true} {...stylex.props(styles.unionSection)} />;
}

export function UtilityWrappedUnionSection(
  props: (UtilityWrappedUnionSectionProps extends infer T
    ? T extends unknown
      ? Omit<T, "someAttribute">
      : never
    : never) &
    Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style" | "someAttribute">,
) {
  return (
    <Text {...props} someAttribute={true} {...stylex.props(styles.utilityWrappedUnionSection)} />
  );
}

export function TransientUnionSection(
  props: (TransientUnionSectionProps & TransientUnionExtraProps extends infer T
    ? T extends unknown
      ? Omit<T, "$tone"> & { [K in Extract<"$tone", keyof T> as "tone"]: T[K] }
      : never
    : never) &
    Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style" | "$tone">,
) {
  const { tone, ...rest } = props;
  return (
    <Text
      {...rest}
      {...stylex.props(
        styles.transientUnionSection,
        tone === "warm" && styles.transientUnionSectionToneWarm,
      )}
    />
  );
}

// Pattern 3m: method-signature attrs props should be omitted from explicit interfaces
export function MethodSection(props: MethodSectionProps) {
  return <Text {...props} onClick={noop} {...stylex.props(styles.methodSection)} />;
}

type SharedTransientAttrsSectionProps = SharedTransientSectionProps &
  Omit<
    React.ComponentPropsWithRef<typeof Text>,
    "className" | "style" | "someAttribute" | "$active"
  >;

// Pattern 3n: shared transient aliases should keep shared alias and remap wrapper-local props
export function SharedTransientAttrsSection(props: SharedTransientAttrsSectionProps) {
  const { active, ...rest } = props;
  return (
    <Text
      {...rest}
      someAttribute={true}
      {...stylex.props(
        styles.sharedTransientAttrsSection,
        active ? styles.sharedTransientAttrsSectionActive : undefined,
      )}
    />
  );
}

type SharedTransientPlainSectionProps = SharedTransientSectionProps &
  Omit<React.ComponentPropsWithRef<typeof Text>, "className" | "style" | "$active">;

export function SharedTransientPlainSection(props: SharedTransientPlainSectionProps) {
  const { active, ...rest } = props;
  return (
    <Text
      {...rest}
      {...stylex.props(
        styles.sharedTransientPlainSection,
        active ? styles.sharedTransientPlainSectionActive : undefined,
      )}
    />
  );
}

// Pattern 4: styled(Component).attrs with function (from Scrollable.tsx)
// This pattern computes attrs from props
interface ScrollableProps extends Omit<
  React.ComponentPropsWithRef<typeof Flex>,
  "className" | "style"
> {
  gutter?: string;
}

export function Scrollable(props: ScrollableProps) {
  const { tabIndex, ...rest } = props;
  return <Flex tabIndex={tabIndex ?? 0} {...rest} {...stylex.props(styles.scrollable)} />;
}

// Pattern 5: styled(Component).attrs with TYPE ALIAS (not interface)
// This is the exact pattern from a design system's Scrollable.tsx
type TypeAliasProps = {
  /** Whether scrollbar gutter should be stable */
  gutter?: "auto" | "stable" | string;
  /** Whether to apply background color */
  $applyBackground?: boolean;
} & Omit<React.ComponentPropsWithRef<typeof Flex>, "className" | "style">;

export function ScrollableWithType(props: TypeAliasProps) {
  const { $applyBackground, tabIndex, ...rest } = props;
  return <Flex tabIndex={tabIndex ?? 0} {...rest} {...stylex.props(styles.scrollableWithType)} />;
}

// Pattern 6: defaultAttrs with different prop name than attr name
// When jsxProp !== attrName, the source prop must still be forwarded to the wrapped component
// E.g., tabIndex: props.focusIndex ?? 0 means focusIndex should still be passed through
interface FocusableProps extends Omit<
  React.ComponentPropsWithRef<typeof Flex>,
  "className" | "style"
> {
  focusIndex?: number;
}

export function FocusableScroll(props: FocusableProps) {
  const { focusIndex, ...rest } = props;
  return (
    <Flex
      tabIndex={focusIndex ?? 0}
      focusIndex={focusIndex}
      {...rest}
      {...stylex.props(styles.focusableScroll)}
    />
  );
}

// Pattern 7: styled.div.attrs with prop reference (native element)
// When an intrinsic element has defaultAttrs, it generates a wrapper component
// that destructures the referenced prop and applies the default value
function Box(props: Omit<React.ComponentProps<"div">, "className" | "style" | "sx">) {
  const { tabIndex, ...rest } = props;
  return <div tabIndex={tabIndex ?? 0} {...rest} sx={styles.box} />;
}

type AlignedFlexProps = Omit<React.ComponentPropsWithRef<typeof Flex>, "className" | "style">;

// Pattern 8: defaultAttrs with same-name prop that IS in base component's explicit props
// Verifies no duplication when attrName === jsxProp and prop is in baseExplicitProps
export function AlignedFlex(props: AlignedFlexProps) {
  const { column, ...rest } = props;
  return <Flex column={column ?? true} {...rest} {...stylex.props(styles.alignedFlex)} />;
}

type DynamicHeightBoxProps = React.PropsWithChildren<{
  height: number;
}>;

// Pattern 10: dynamic attrs with computed style object
// The dynamic inline styles should be preserved as inline style prop
function DynamicHeightBox(props: DynamicHeightBoxProps) {
  const { children, height } = props;
  return (
    <div
      sx={[
        styles.dynamicHeightBox,
        height ? styles.dynamicHeightBoxHeight(`${height}px`) : undefined,
      ]}
    >
      {children}
    </div>
  );
}

type PositionedTileProps = React.PropsWithChildren<{
  height: number;
}>;

// Pattern 11: dynamic attrs style must be applied as style, not leaked as an inert DOM prop
function PositionedTile(props: PositionedTileProps) {
  const { children, height } = props;
  return <div sx={styles.positionedTile(height)}>{children}</div>;
}

type OptionalHeightBoxProps = React.PropsWithChildren<{
  height?: number;
}>;

// Pattern 11b: optional direct attrs style values should be omitted when undefined
function OptionalHeightBox(props: OptionalHeightBoxProps) {
  const { children, height } = props;
  return (
    <div sx={[styles.optionalHeightBox, height != null && styles.optionalHeightBoxHeight(height)]}>
      {children}
    </div>
  );
}

type MixedFallbackHeightBoxProps = React.PropsWithChildren<{
  height?: number;
}>;

function MixedFallbackHeightBox(props: MixedFallbackHeightBoxProps) {
  const { children, height } = props;
  return <div sx={styles.mixedFallbackHeightBox(height ?? "16px")}>{children}</div>;
}

type SeparatorLineProps = React.PropsWithChildren<{
  height?: number;
  sx?: stylex.StyleXStyles;
  className?: string;
  style?: React.CSSProperties;
}>;

// Pattern 12: dynamic attrs style should merge with caller style, with caller style last
function SeparatorLine(props: SeparatorLineProps) {
  const { className, children, style, sx, height } = props;
  return (
    <div {...mergedSx([styles.separatorLine(height ?? 1), sx], className, style)}>{children}</div>
  );
}

type FallbackSeparatorLineProps = React.PropsWithChildren<{
  height?: number;
}>;

function FallbackSeparatorLine(props: FallbackSeparatorLineProps) {
  const { children, height } = props;
  return <div sx={styles.fallbackSeparatorLine(height ? `${height}px` : "16px")}>{children}</div>;
}

function HeaderSeparator(props: {
  className?: string;
  height?: number;
  style?: React.CSSProperties;
}) {
  const { className, height, style } = props;
  return <SeparatorLine height={height} className={className} style={style} />;
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

function BaseToolbarButton(
  props: Omit<
    React.ComponentPropsWithRef<typeof ButtonLike>,
    "className" | "style" | "size" | "variant"
  >,
) {
  return (
    <ButtonLike
      {...props}
      size="small"
      variant="borderless"
      {...stylex.props(styles.baseToolbarButton)}
    />
  );
}

function ActiveToolbarButton(props: { children?: React.ReactNode }) {
  return (
    <ButtonLike
      {...props}
      size="small"
      variant="borderless"
      {...stylex.props(styles.baseToolbarButton, styles.activeToolbarButton)}
    />
  );
}

// Pattern 14: attrs style identifiers from module scope must not be treated as props
const MODULE_SCOPE_TEXT_COLOR = "#0f766e";

const CALLBACK_SCOPE_TEXT_COLOR = "#7c3aed";

// Pattern 15: static attrs that reference module-scope values must be preserved
const iconSize = 14;

function StyledIcon(
  props: Omit<React.ComponentPropsWithRef<typeof Icon>, "className" | "style" | "size">,
) {
  return <Icon {...props} size={iconSize} {...stylex.props(styles.icon)} />;
}

function AttrsSxButton(props: { children?: React.ReactNode }) {
  return <SxAwareButton {...props} type="button" sx={[styles.attrsSxButton, attrsMarkerStyle]} />;
}

// Pattern 17: static attrs with object/array values must be preserved (not dropped)
// Non-style attrs that are object or array literals are hoisted verbatim onto the
// rendered component, alongside the merged className/style.
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

function AnimatedBox(props: { children?: React.ReactNode }) {
  return (
    <Motion
      {...props}
      initial="hidden"
      animate="visible"
      transition={{
        duration: 0.2,
      }}
      keyframes={[0, 0.5, 1]}
      {...stylex.props(styles.animatedBox)}
    />
  );
}

export const App = () => (
  <>
    <Input small placeholder="Small" />
    <Input placeholder="Normal" />
    <Input padding="2em" placeholder="Padded" />
    <TextInput placeholder="Text input" />
    <Background loaded={false}>Content</Background>
    <Section label="section-label">Section content</Section>
    <ImportedSection label="imported-section-label">Imported section content</ImportedSection>
    <HighlightSection active>Highlighted section content</HighlightSection>
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
    <TransientUnionSection detail="branch" kind="alpha" tone="warm">
      Transient union section content
    </TransientUnionSection>
    <MethodSection label="method-label">Method section content</MethodSection>
    <SharedTransientAttrsSection active label="shared-transient-attrs">
      Shared transient attrs section content
    </SharedTransientAttrsSection>
    <SharedTransientPlainSection active label="shared-transient-plain">
      Shared transient plain section content
    </SharedTransientPlainSection>
    <Scrollable>Scrollable content</Scrollable>
    <ScrollableWithType gutter="stable">Type alias scrollable</ScrollableWithType>
    <FocusableScroll focusIndex={5}>Focus content</FocusableScroll>
    <Box>Box content</Box>
    <AlignedFlex>Aligned content</AlignedFlex>
    <span sx={styles.noWrapText}>No wrapping text</span>
    <DynamicHeightBox height={50}>Dynamic height</DynamicHeightBox>
    <PositionedTile height={64}>Tile with attrs height</PositionedTile>
    <OptionalHeightBox>Optional height omitted</OptionalHeightBox>
    <OptionalHeightBox height={24}>Optional height set</OptionalHeightBox>
    <MixedFallbackHeightBox>Mixed fallback height</MixedFallbackHeightBox>
    <HeaderSeparator height={2} style={{ opacity: 1 }} />
    <FallbackSeparatorLine height={4}>Fallback separator</FallbackSeparatorLine>
    <ActiveToolbarButton>Inherited attrs</ActiveToolbarButton>
    <span sx={styles.moduleScopeStyleText}>Module scope style</span>
    <span sx={styles.callbackScopeStyleText}>Callback scope style</span>
    <StyledIcon title="Attrs icon size" />
    <AttrsSxButton>Attrs sx</AttrsSxButton>
    <div title={"Line1\nLine2"} sx={styles.escapedTemplateTitle}>
      Escaped template title (hover to see)
    </div>
    <div title="Plain template" sx={styles.plainTemplateTitle}>
      Plain template title (hover to see)
    </div>
    <AnimatedBox>Animated box</AnimatedBox>
  </>
);

const styles = stylex.create({
  input: {
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#bf4f74",
    display: "block",
    marginTop: 0,
    marginRight: 0,
    marginBottom: "1em",
    marginLeft: 0,
    "::placeholder": {
      color: "#bf4f74",
    },
  },
  inputPadding: (padding: string) => ({
    padding,
  }),
  textInput: {
    height: 32,
    padding: 8,
    backgroundColor: "white",
  },
  background: {
    position: "absolute",
    top: 0,
    bottom: 0,
    opacity: 1,
  },
  backgroundLoaded: {
    opacity: 0,
  },
  section: {
    padding: 16,
    backgroundColor: "#f0f9ff",
  },
  importedSection: {
    padding: 12,
    backgroundColor: "#ecfdf5",
  },
  highlightSection: {
    color: "#64748b",
  },
  highlightSectionActive: {
    color: "#1d4ed8",
  },
  utilitySection: {
    padding: 10,
    backgroundColor: "#dbeafe",
  },
  utilitySectionToneSuccess: {
    backgroundColor: "#dcfce7",
  },
  sharedAttrsSection: {
    padding: 14,
    backgroundColor: "#fef3c7",
  },
  sharedPlainSection: {
    color: "#1e3a8a",
  },
  sharedPlainSectionToneSecondary: {
    color: "#7c2d12",
  },
  importedIntersectionSection: {
    padding: 6,
    backgroundColor: "#fdf2f8",
  },
  focusIndexSection: {
    color: "#334155",
  },
  pickSection: {
    padding: 18,
    backgroundColor: "#eef2ff",
  },
  multiImportedSection: {
    padding: 20,
    backgroundColor: "#f0fdf4",
  },
  inheritedSection: {
    padding: 22,
    backgroundColor: "#fff7ed",
  },
  unionSection: {
    padding: 24,
    backgroundColor: "#f8fafc",
  },
  utilityWrappedUnionSection: {
    padding: 25,
    backgroundColor: "#f1f5f9",
  },
  transientUnionSection: {
    color: "#1d4ed8",
  },
  transientUnionSectionToneWarm: {
    color: "#9f1239",
  },
  methodSection: {
    padding: 26,
    backgroundColor: "#eff6ff",
  },
  sharedTransientAttrsSection: {
    color: "#475569",
  },
  sharedTransientAttrsSectionActive: {
    color: "#0f766e",
  },
  sharedTransientPlainSection: {
    backgroundColor: "#f8fafc",
  },
  sharedTransientPlainSectionActive: {
    backgroundColor: "#ccfbf1",
  },
  scrollable: {
    overflowY: "auto",
    position: "relative",
  },
  scrollableWithType: {
    overflowY: "auto",
    position: "relative",
    flexGrow: 1,
  },
  focusableScroll: {
    overflowY: "auto",
  },
  box: {
    overflow: "auto",
  },
  alignedFlex: {
    alignItems: "center",
  },
  // Pattern 9: static attrs with a style object
  // The inline style properties should be preserved in the output
  noWrapText: {
    color: "blue",
    whiteSpace: "nowrap",
  },
  dynamicHeightBox: {
    display: "flex",
    alignItems: "center",
  },
  dynamicHeightBoxHeight: (height: string) => ({
    height,
  }),
  positionedTile: (height: number) => ({
    position: "absolute",
    minHeight: 1,
    backgroundColor: "#eef2ff",
    outlineWidth: {
      default: null,
      ":focus-visible": "2px",
    },
    outlineStyle: {
      default: null,
      ":focus-visible": "solid",
    },
    outlineColor: {
      default: null,
      ":focus-visible": "#4f46e5",
    },
    outlineOffset: {
      default: null,
      ":focus-visible": "3px",
    },
    height,
  }),
  optionalHeightBox: {
    display: "flex",
    alignItems: "center",
    padding: 4,
    backgroundColor: "#fee2e2",
  },
  optionalHeightBoxHeight: (height: number) => ({
    height,
  }),
  mixedFallbackHeightBox: (height: string | number) => ({
    display: "flex",
    alignItems: "center",
    padding: 4,
    backgroundColor: "#fef3c7",
    height,
  }),
  separatorLine: (height: string | number) => ({
    width: "100%",
    backgroundColor: "#94a3b8",
    height,
  }),
  fallbackSeparatorLine: (height: string | number) => ({
    width: "100%",
    backgroundColor: "#16a34a",
    height,
  }),
  baseToolbarButton: {
    paddingBlock: 4,
    paddingInline: 8,
  },
  activeToolbarButton: {
    color: "#4338ca",
    backgroundColor: "#e0e7ff",
  },
  moduleScopeStyleText: {
    fontWeight: 600,
    color: "#0f766e",
  },
  callbackScopeStyleText: {
    fontStyle: "italic",
    color: "#7c3aed",
  },
  icon: {
    position: "relative",
    left: -3,
  },
  attrsSxButton: {
    color: "#2563eb",
  },
  // Pattern 16: static attrs with template literal containing escape sequences
  // The cooked value (with actual newline) must be used, not the raw source text
  escapedTemplateTitle: {
    padding: 8,
    backgroundColor: "#fdf4ff",
  },
  // Pattern 16b: static attrs with regular template literal (no escapes)
  plainTemplateTitle: {
    padding: 8,
    backgroundColor: "#fff1f2",
  },
  animatedBox: {
    padding: 8,
    backgroundColor: "#ede9fe",
    color: "#5b21b6",
  },
});
