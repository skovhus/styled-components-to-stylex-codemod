import * as React from "react";
import styled from "styled-components";

type GroupHeaderProps = {
  label: React.ReactNode;
  id: string;
  style?: React.CSSProperties;
  className?: string;
};

/** A header component that internally uses styled-components with padding-inline. */
export const GroupHeader = (props: GroupHeaderProps) => {
  return (
    <StyledHeader className={props.className} style={props.style} id={props.id}>
      {props.label}
    </StyledHeader>
  );
};

GroupHeader.HEIGHT = 30;

const StyledHeader = styled.div`
  padding-inline: 11px;
  padding-block: 8px;
  height: ${GroupHeader.HEIGHT}px;
  user-select: none;
  font-size: 11px;
  font-weight: 500;
  color: #888;
`;
