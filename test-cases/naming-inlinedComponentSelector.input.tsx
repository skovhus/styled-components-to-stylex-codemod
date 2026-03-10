// Component used as selector in css helper should not lose its name after inlining
import * as React from "react";
import styled, { css } from "styled-components";

const GradientPath = styled.path`
  fill: url(#gradient);
  opacity: 0;
  transition: opacity 0.3s;
`;

const FilteredGroup = styled.g`
  filter: url(#blur);
  transform: scale(1);
  transition: transform 0.3s;
`;

const containerAnimation = css`
  &:hover ${GradientPath} {
    opacity: 1;
  }
  &:hover ${FilteredGroup} {
    transform: scale(1.1);
  }
`;

const Container = styled.div`
  ${containerAnimation}
  padding: 16px;
  background-color: #f0f5ff;
`;

export function App() {
  return (
    <Container>
      <svg viewBox="0 0 100 100">
        <GradientPath d="M10 80 Q 52.5 10, 95 80" />
        <FilteredGroup>
          <rect x="10" y="10" width="80" height="80" fill="#6a7ab5" />
        </FilteredGroup>
      </svg>
    </Container>
  );
}
