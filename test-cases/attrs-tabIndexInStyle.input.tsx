import styled from "styled-components";

type Props = {
  $applyBackground?: boolean;
};

// Test case: tabIndex used in BOTH attrs (with default) AND in styles
// The default value should be preserved when destructuring
export const Component = styled.div.attrs((props) => ({
  tabIndex: props.tabIndex ?? 0,
}))<Props>`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
  background-color: ${(props) => (props.$applyBackground ? props.theme.color.bgBase : "inherit")};
  outline: ${(props) => (props.tabIndex === 0 ? "none" : "auto")};
`;

export const App = () => <Component>Tab me!</Component>;
