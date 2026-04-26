// theme.isDark conditional on a component wrapper should apply dark/light styles in JSX.
import * as React from "react";
import styled from "styled-components";

function InnerList(
  props: React.PropsWithChildren<{ className?: string; style?: React.CSSProperties }>,
) {
  return <div role="tablist" {...props} />;
}

const StyledList = styled(InnerList)`
  display: flex;
  padding: 4px;
  border-radius: 6px;
  background: ${(props) => (props.theme.isDark ? props.theme.color.bgBase : props.theme.color.bgSub)};
`;

export const App = () => (
  <StyledList>
    <button>Tab 1</button>
    <button>Tab 2</button>
  </StyledList>
);
