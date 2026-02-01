import styled from "styled-components";

// Using !important to override inline styles or third-party CSS
const OverrideButton = styled.button`
  background: #BF4F74 !important;
  color: white !important;
  border: none !important;
  padding: 8px 16px;
  border-radius: 4px;
`;

// Overriding specific properties
const ForceWidth = styled.div`
  width: 100% !important;
  max-width: 500px !important;
  margin: 0 auto;
`;

// Mixed important and normal
const MixedStyles = styled.p`
  font-size: 16px;
  color: #333 !important;
  line-height: 1.5;
  margin: 0 !important;
`;

// Important in pseudo-selectors
const ImportantHover = styled.a`
  color: #BF4F74;
  text-decoration: none;

  &:hover {
    color: #4F74BF !important;
    text-decoration: underline !important;
  }
`;

export const App = () => (
  <div>
    <OverrideButton>Should have !important styles</OverrideButton>
    <ForceWidth>Full width content</ForceWidth>
    <MixedStyles>Color and margin have !important</MixedStyles>
    <ImportantHover href="#">Hover me</ImportantHover>
  </div>
);
