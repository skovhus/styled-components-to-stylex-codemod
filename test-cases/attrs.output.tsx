import * as stylex from "@stylexjs/stylex";
import * as React from "react";

// Simulated imported component
const Flex = (props: React.ComponentProps<"div"> & { column?: boolean; center?: boolean }) => {
  const { column, center, ...rest } = props;
  return <div {...rest} />;
};

const styles = stylex.create({
  // Pattern 1: styled.input.attrs (dot notation)
  input: {
    borderRadius: "3px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#bf4f74",
    display: "block",
    margin: "0 0 1em",
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
});

export function Background(props: BackgroundProps) {
  const { loaded, style, ...rest } = props;
  return (
    <Flex
      {...rest}
      {...stylex.props(styles.background, loaded && styles.backgroundLoaded)}
      style={style}
    />
  );
}

export function Scrollable(props: ScrollableProps) {
  return <Flex {...props} {...stylex.props(styles.scrollable)} />;
}

// Pattern 2: styled("input").attrs (function call + attrs)
export interface TextInputProps {
  allowPMAutofill?: boolean;
}

// Pattern 3: styled(Component).attrs with object
// This pattern passes static attrs as an object
interface BackgroundProps extends React.ComponentProps<typeof Flex> {
  loaded: boolean;
}

// Pattern 4: styled(Component).attrs with function (from Scrollable.tsx)
// This pattern computes attrs from props
interface ScrollableProps extends React.ComponentProps<typeof Flex> {
  gutter?: string;
}

export const App = () => (
  <>
    <input type="text" size={5} {...stylex.props(styles.input)} placeholder="Small" />
    <input type="text" {...stylex.props(styles.input)} placeholder="Normal" />
    <input
      type="text"
      {...stylex.props(styles.input, styles.inputPadding("2em"))}
      placeholder="Padded"
    />
    <input data-1p-ignore={true} {...stylex.props(styles.textInput)} placeholder="Text input" />
    <Background loaded={false}>Content</Background>
    <Scrollable>Scrollable content</Scrollable>
  </>
);
