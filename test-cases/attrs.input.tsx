import * as React from "react";
import styled from "styled-components";

// Simulated imported component
const Flex = (
  props: React.ComponentProps<"div"> & { column?: boolean; center?: boolean; focusIndex?: number },
) => {
  const { column, center, focusIndex, ...rest } = props;
  return <div data-focus-index={focusIndex} {...rest} />;
};

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
// Bug: type aliases might not get `extends React.ComponentProps<...>` added
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
  </>
);
