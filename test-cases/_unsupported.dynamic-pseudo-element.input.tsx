import styled from "styled-components";

/**
 * Test case for dynamic styles in pseudo elements.
 * Reproduces: https://github.com/facebook/stylex/issues/1396
 */
const Badge = styled.span<{ $badgeColor: string }>`
  position: relative;

  &::after {
    content: "";
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    top: 0;
    right: 0;
    background-color: ${(props) => props.$badgeColor};
  }
`;

export const App = () => (
  <div>
    <Badge $badgeColor="red">Notification</Badge>
    <Badge $badgeColor="green">Online</Badge>
  </div>
);
