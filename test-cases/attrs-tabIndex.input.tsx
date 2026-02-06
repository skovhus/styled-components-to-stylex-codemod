import styled from "styled-components";

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
