import styled from "styled-components";

/**
 * Test case for dynamic styles in pseudo elements (::before / ::after).
 * Uses CSS custom properties on the parent element, referenced via var()
 * in the pseudo-element's static StyleX styles.
 */
const Badge = styled.span<{ $badgeColor: string }>`
  position: relative;
  padding: 8px 16px;
  background-color: #f0f0f0;

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
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <Badge $badgeColor="red">Notification</Badge>
    <Badge $badgeColor="green">Online</Badge>
    <Badge $badgeColor="blue">Info</Badge>
  </div>
);
