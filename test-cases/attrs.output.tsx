import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Simulated imported component
const Flex = (
  props: React.ComponentProps<"div"> & { column?: boolean; center?: boolean; focusIndex?: number },
) => {
  const { column, center, focusIndex, ...rest } = props;
  return <div data-focus-index={focusIndex} {...rest} />;
};

type InputProps = Omit<React.ComponentProps<"input">, "className" | "style"> & {
  $padding?: string;
  $small?: boolean;
};

// Pattern 1: styled.input.attrs (dot notation)
function Input(props: InputProps) {
  const { $padding, $small, ...rest } = props;

  return (
    <input
      size={$small ? 5 : undefined}
      type="text"
      {...rest}
      {...stylex.props(styles.input, $padding != null && styles.inputPadding($padding))}
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

  return (
    <input
      data-1p-ignore={allowPMAutofill !== true}
      {...rest}
      {...stylex.props(styles.textInput)}
    />
  );
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
type TypeAliasProps = Omit<React.ComponentPropsWithRef<typeof Flex>, "className" | "style"> & {
  /** Whether scrollbar gutter should be stable */
  gutter?: "auto" | "stable" | string;
  /** Whether to apply background color */
  $applyBackground?: boolean;
};

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
    <div tabIndex={tabIndex ?? 0} {...rest} {...stylex.props(styles.box)}>
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

type DynamicHeightBoxProps = Omit<React.ComponentProps<"div">, "className" | "style"> & {
  $height: number;
};

// Pattern 10: dynamic attrs with computed style object
// The dynamic inline styles should be preserved as a dynamic StyleX style
function DynamicHeightBox(props: DynamicHeightBoxProps) {
  const { children, $height, ...rest } = props;

  return (
    <div
      {...rest}
      {...stylex.props(
        styles.dynamicHeightBox,
        $height ? styles.dynamicHeightBoxHeight(`${$height}px`) : undefined,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <>
    <Input $small placeholder="Small" />
    <Input placeholder="Normal" />
    <Input $padding="2em" placeholder="Padded" />
    <TextInput placeholder="Text input" />
    <Background loaded={false}>Content</Background>
    <Scrollable>Scrollable content</Scrollable>
    <ScrollableWithType gutter="stable">Type alias scrollable</ScrollableWithType>
    <FocusableScroll focusIndex={5}>Focus content</FocusableScroll>
    <Box>Box content</Box>
    <AlignedFlex>Aligned content</AlignedFlex>
    <span {...stylex.props(styles.noWrapText)}>No wrapping text</span>
    <DynamicHeightBox $height={50}>Dynamic height</DynamicHeightBox>
  </>
);

const styles = stylex.create({
  // Pattern 1: styled.input.attrs (dot notation)
  input: {
    borderRadius: "3px",
    borderWidth: "1px",
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
    height: "32px",
    padding: "8px",
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
    whiteSpace: "nowrap",
    color: "blue",
  },
  // Pattern 10: dynamic attrs with computed style object
  // The dynamic inline styles should be preserved as a dynamic StyleX style
  dynamicHeightBox: {
    display: "flex",
    alignItems: "center",
  },
  dynamicHeightBoxHeight: (height: string) => ({
    height,
  }),
});
