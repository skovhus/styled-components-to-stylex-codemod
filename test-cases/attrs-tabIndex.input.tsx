import styled from "styled-components";

// Bug: `.attrs()` sets `tabIndex` with a default of 0, but the converted output
// does not preserve the tabIndex attribute or its default value. The element
// loses keyboard focusability that the original styled component provided.

type Props = {
  $applyBackground?: boolean;
};

export const Component = styled.div.attrs((props) => ({
  tabIndex: props.tabIndex ?? 0,
}))<Props>`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
  background-color: ${(props) => (props.$applyBackground ? props.theme.color.bgBase : "inherit")};
`;

export const App = () => <Component>Tab me!</Component>;
