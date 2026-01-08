import * as React from "react";
import styled from "styled-components";

// Simulated imported component
const Flex = (props: React.ComponentProps<"div"> & { column?: boolean; center?: boolean }) => {
  const { column, center, ...rest } = props;
  return <div {...rest} />;
};

// Pattern 1: styled.input.attrs (dot notation)
const Input = styled.input.attrs<{ $padding?: string; $small?: boolean }>((props) => ({
  type: "text",
  size: props.$small ? 5 : undefined,
}))`
  border-radius: 3px;
  border: 1px solid #BF4F74;
  display: block;
  margin: 0 0 1em;
  padding: ${(props) => props.$padding};

  &::placeholder {
    color: #BF4F74;
  }
`;

// Pattern 2: styled("input").attrs (function call + attrs)
export interface TextInputProps {
  allowPMAutofill?: boolean;
}

export const TextInput = styled("input").attrs<TextInputProps>((props) => ({
  "data-1p-ignore": props.allowPMAutofill !== true,
}))<TextInputProps>`
  height: 32px;
  padding: 8px;
  background: white;
`;

// Pattern 3: styled(Component).attrs with object (from LinearLoading.tsx)
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

export const App = () => (
  <>
    <Input $small placeholder="Small" />
    <Input placeholder="Normal" />
    <Input $padding="2em" placeholder="Padded" />
    <TextInput placeholder="Text input" />
    <Background loaded={false}>Content</Background>
    <Scrollable>Scrollable content</Scrollable>
  </>
);
