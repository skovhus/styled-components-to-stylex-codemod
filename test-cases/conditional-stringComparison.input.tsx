import * as React from "react";
import styled from "styled-components";

const IconButton = (props: React.ComponentProps<"button">) => <button {...props} />;

const StyledIconButton = styled(IconButton)<{ useRoundStyle?: boolean }>`
  ${(props) => props.useRoundStyle !== false && "border-radius: 100%;"}
  padding: 4px;
`;

export const App = () => <StyledIconButton>Icon</StyledIconButton>;
