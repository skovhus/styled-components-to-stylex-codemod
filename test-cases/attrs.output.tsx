import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// Simulated imported component
const Flex = (
  props: React.ComponentProps<"div"> & { column?: boolean; center?: boolean; focusIndex?: number },
) => {
  const { column, center, focusIndex, ...rest } = props;
  return <div data-focus-index={focusIndex} {...rest} />;
};

type InputProps = {
  padding?: string;
  small?: boolean;
} & React.ComponentProps<"input">;

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
  props: TextInputProps & Omit<React.ComponentProps<"input">, "className" | "style">,
) {
  const { allowPMAutofill, ...rest } = props;
  return <input data-1p-ignore={allowPMAutofill !== true} {...rest} sx={styles.textInput} />;
}

// Pattern 3: styled(Component).attrs with object
// This pattern passes static attrs as an object
interface BackgroundProps extends Omit<
  React.ComponentPropsWithRef<typeof Flex>,
  "className" | "style"
> {
  loaded: boolean;
}

export function Background(props: BackgroundProps) {
  const { children, loaded, ...rest } = props;
  return (
    <Flex
      {...rest}
      column={true}
      center={true}
      {...stylex.props(styles.background, loaded ? styles.backgroundLoaded : undefined)}
    >
      {children}
    </Flex>
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
  const { children, tabIndex, ...rest } = props;
  return (
    <Flex tabIndex={tabIndex ?? 0} {...rest} {...stylex.props(styles.scrollable)}>
      {children}
    </Flex>
  );
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
  const { children, $applyBackground, tabIndex, ...rest } = props;
  return (
    <Flex tabIndex={tabIndex ?? 0} {...rest} {...stylex.props(styles.scrollableWithType)}>
      {children}
    </Flex>
  );
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
  const { children, focusIndex, ...rest } = props;
  return (
    <Flex
      tabIndex={focusIndex ?? 0}
      focusIndex={focusIndex}
      {...rest}
      {...stylex.props(styles.focusableScroll)}
    >
      {children}
    </Flex>
  );
}

// Pattern 7: styled.div.attrs with prop reference (native element)
// When an intrinsic element has defaultAttrs, it generates a wrapper component
// that destructures the referenced prop and applies the default value
function Box(props: Omit<React.ComponentProps<"div">, "className" | "style">) {
  const { children, tabIndex, ...rest } = props;
  return (
    <div tabIndex={tabIndex ?? 0} {...rest} sx={styles.box}>
      {children}
    </div>
  );
}

type AlignedFlexProps = Omit<React.ComponentPropsWithRef<typeof Flex>, "className" | "style">;

// Pattern 8: defaultAttrs with same-name prop that IS in base component's explicit props
// Verifies no duplication when attrName === jsxProp and prop is in baseExplicitProps
export function AlignedFlex(props: AlignedFlexProps) {
  const { children, column, ...rest } = props;
  return (
    <Flex column={column ?? true} {...rest} {...stylex.props(styles.alignedFlex)}>
      {children}
    </Flex>
  );
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

type SeparatorLineProps = React.PropsWithChildren<{
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}>;

// Pattern 12: dynamic attrs style should merge with caller style, with caller style last
function SeparatorLine(props: SeparatorLineProps) {
  const { className, children, style, height } = props;
  return <div {...mergedSx(styles.separatorLine(height ?? 1), className, style)}>{children}</div>;
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
  props: Omit<React.ComponentPropsWithRef<typeof ButtonLike>, "className" | "style">,
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

function ActiveToolbarButton(
  props: Omit<React.ComponentPropsWithRef<typeof ButtonLike>, "className" | "style">,
) {
  return (
    <ButtonLike
      {...props}
      size="small"
      variant="borderless"
      {...stylex.props(styles.baseToolbarButton, styles.activeToolbarButton)}
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
    <Scrollable>Scrollable content</Scrollable>
    <ScrollableWithType gutter="stable">Type alias scrollable</ScrollableWithType>
    <FocusableScroll focusIndex={5}>Focus content</FocusableScroll>
    <Box>Box content</Box>
    <AlignedFlex>Aligned content</AlignedFlex>
    <span sx={styles.noWrapText}>No wrapping text</span>
    <DynamicHeightBox height={50}>Dynamic height</DynamicHeightBox>
    <PositionedTile height={64}>Tile with attrs height</PositionedTile>
    <HeaderSeparator height={2} style={{ opacity: 1 }} />
    <FallbackSeparatorLine height={4}>Fallback separator</FallbackSeparatorLine>
    <ActiveToolbarButton>Inherited attrs</ActiveToolbarButton>
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
  positionedTile: (height: string | number) => ({
    position: "absolute",
    minHeight: 1,
    backgroundColor: "#eef2ff",
    outline: {
      default: null,
      ":focus-visible": "2px solid #4f46e5",
    },
    outlineOffset: {
      default: null,
      ":focus-visible": "3px",
    },
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
});
