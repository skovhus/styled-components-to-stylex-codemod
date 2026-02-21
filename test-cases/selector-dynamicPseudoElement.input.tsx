import styled from "styled-components";

/**
 * Test case for dynamic styles in pseudo elements (::before / ::after).
 * Uses CSS custom properties as a workaround for StyleX's limitation
 * with dynamic values inside pseudo elements.
 * See: https://github.com/facebook/stylex/issues/1396
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
