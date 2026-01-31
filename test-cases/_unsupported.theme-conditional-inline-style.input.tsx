// @expected-warning: Theme-dependent conditional values require a project-specific theme source (e.g. useTheme())
import * as React from "react";
import styled from "styled-components";

// Unsupported: theme-dependent branching requires a project-specific theme source (e.g. useTheme()).
// The codemod can resolve theme *values* to tokens, but it does not know how to access runtime theme
// state for conditions like `theme.isDark`.

export const Chip = styled.div`
  background-color: ${(props: any) =>
    props.theme.isDark
      ? // Using double `highlightVariant` is an exception and not recommended in general.
        props.theme.highlightVariant(props.theme.highlightVariant(props.theme.color.bgFocus))
      : props.theme.color.bgFocus};
`;

export const App = () => <Chip />;
