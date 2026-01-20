import styled, { css } from "styled-components";

const rowBase = css`
  display: grid;
  grid-template-columns: 1fr 2fr;
  grid-column: 1 / -1;
  align-items: center;
  padding: 0 8px;
  min-height: 36px;
  background: ${({ theme }) => theme.color.bgBase};
`;

const GroupHeaderRow = styled.div`
  ${rowBase}
  position: sticky;
  top: var(--sticky-top, 0px);
  z-index: 3; /* above regular rows */
  border-top: 1px solid ${({ theme }) => theme.color.bgBorderFaint};
  border-bottom: 1px solid ${({ theme }) => theme.color.bgBorderFaint};
`;

const ProjectRow = styled.div`
  ${rowBase}
  &:hover {
    background: ${({ theme }) => theme.color.bgBaseHover};
  }
`;

export const App = () => (
  <div>
    <GroupHeaderRow>Group</GroupHeaderRow>
    <ProjectRow>Project</ProjectRow>
  </div>
);
