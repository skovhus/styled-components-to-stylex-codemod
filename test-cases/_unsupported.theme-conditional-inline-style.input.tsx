// @expected-warning: Theme-dependant call expression could not be resolved (e.g. theme helper calls like theme.highlight() are not supported)
import * as React from "react";
import styled from "styled-components";

export const Chip = styled.div`
  background-color: ${(props: any) =>
    props.theme.isDark
      ? props.theme.highlightVariant(props.theme.color.bgFocus)
      : props.theme.color.bgFocus};
`;

export const App = () => <Chip />;
