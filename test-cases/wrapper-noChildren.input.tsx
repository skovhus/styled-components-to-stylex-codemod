import styled from "styled-components";

// Pattern: styled(Component) where the base component does NOT accept children
// The wrapper should NOT try to pass children through

interface TextDividerProps {
  /** The text to display */
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

/** A divider that displays text - does not accept children */
function TextDivider(props: TextDividerProps) {
  return (
    <div className={props.className} style={props.style}>
      <span>{props.text}</span>
    </div>
  );
}

TextDivider.HEIGHT = 30;

/** Styled wrapper for TextDivider */
export const StyledTextDivider = styled(TextDivider)`
  padding-left: 20px;
`;

StyledTextDivider.HEIGHT = TextDivider.HEIGHT;

// Usage - no children passed
export const App = () => <StyledTextDivider text="Section" />;
