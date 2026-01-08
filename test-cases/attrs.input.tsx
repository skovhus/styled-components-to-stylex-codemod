import styled from "styled-components";

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

export const App = () => (
  <>
    <Input $small placeholder="Small" />
    <Input placeholder="Normal" />
    <Input $padding="2em" placeholder="Padded" />
    <TextInput placeholder="Text input" />
  </>
);
