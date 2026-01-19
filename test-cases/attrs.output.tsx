import * as React from "react";
import * as stylex from "@stylexjs/stylex";

// Simulated imported component
const Flex = (props: React.ComponentProps<"div"> & { column?: boolean; center?: boolean }) => {
  const { column, center, ...rest } = props;
  return <div {...rest} />;
};

type InputProps = Omit<React.ComponentProps<"input">, "className" | "style"> & {
  $padding?: string;
  $small?: boolean;
};

// Pattern 1: styled.input.attrs (dot notation)
function Input(props: InputProps) {
  const { $padding, $small, ...rest } = props;

  const sx = stylex.props(styles.input, $padding != null && styles.inputPadding($padding));
  return <input size={$small ? 5 : undefined} type="text" {...rest} {...sx} />;
}

// Pattern 2: styled("input").attrs (function call + attrs)
export interface TextInputProps extends Omit<React.ComponentProps<"input">, "className" | "style"> {
  allowPMAutofill?: boolean;
  // Data attribute used by 1Password to control autofill behavior
  "data-1p-ignore"?: boolean;
}

export function TextInput(props: TextInputProps) {
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
interface BackgroundProps extends Omit<React.ComponentProps<typeof Flex>, "className" | "style"> {
  loaded: boolean;
}

export function Background(props: BackgroundProps) {
  const { children, loaded, ...rest } = props;
  return (
    <Flex
      column={true}
      center={true}
      {...rest}
      {...stylex.props(styles.background, loaded && styles.backgroundLoaded)}
    >
      {children}
    </Flex>
  );
}

// Pattern 4: styled(Component).attrs with function (from Scrollable.tsx)
// This pattern computes attrs from props
interface ScrollableProps extends Omit<React.ComponentProps<typeof Flex>, "className" | "style"> {
  gutter?: string;
}

export function Scrollable(props: ScrollableProps) {
  return <Flex tabIndex={0} {...props} {...stylex.props(styles.scrollable)} />;
}

// Pattern 5: styled(Component).attrs with TYPE ALIAS (not interface)
// Bug: type aliases might not get `extends React.ComponentProps<...>` added
// This is the exact pattern from a design system's Scrollable.tsx
type TypeAliasProps = Omit<React.ComponentProps<typeof Flex>, "className" | "style"> & {
  /** Whether scrollbar gutter should be stable */
  gutter?: "auto" | "stable" | string;
  /** Whether to apply background color */
  $applyBackground?: boolean;
};

export function ScrollableWithType(props: TypeAliasProps) {
  const { children, $applyBackground, ...rest } = props;
  return (
    <Flex tabIndex={0} {...rest} {...stylex.props(styles.scrollableWithType)}>
      {children}
    </Flex>
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
});
