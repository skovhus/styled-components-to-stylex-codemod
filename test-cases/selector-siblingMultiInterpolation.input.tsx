import styled from "styled-components";

const Thing = styled.div`
  color: #223;
  background: white;
  padding: 8px;

  &.something ~ & {
    box-shadow: 0 0 ${(props) => props.theme.color.labelBase} ${(props) => props.theme.color.bgSub};
  }
`;

export const App = () => (
  <div>
    <Thing className="something">Anchor</Thing>
    <Thing>Follower one</Thing>
    <Thing>Follower two</Thing>
  </div>
);
