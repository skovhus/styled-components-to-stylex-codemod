import styled from "styled-components";

// Using !important to override inline styles or third-party CSS
const OverrideButton = styled.button`
  background: #bf4f74 !important;
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
  color: #bf4f74;
  text-decoration: none;

  &:hover {
    color: #4f74bf !important;
    text-decoration: underline !important;
  }
`;

export const App = () => (
  <div>
    <OverrideButton style={{ background: "blue" }}>
      Should be pink despite inline style
    </OverrideButton>
    <ForceWidth>Full width content</ForceWidth>
    <MixedStyles style={{ color: "red", margin: "20px" }}>
      Color and margin should be overridden
    </MixedStyles>
    <ImportantHover href="#">Hover me</ImportantHover>
  </div>
);
