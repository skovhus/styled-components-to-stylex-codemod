import * as React from "react";
import styled from "styled-components";

const Text = styled.span`
  font-size: 12px;
  color: ${(props) =>
    props.theme.isDark ? props.theme.color.labelBase : props.theme.color.labelMuted};
  border-color: ${(props) =>
    props.theme.isDark ? props.theme.color.bgSub : props.theme.color.bgBorderFaint};
`;

export const App = () => <Text>Label</Text>;
