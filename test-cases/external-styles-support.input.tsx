import styled from "styled-components";

/**
 *  This component is exported and will use shouldSupportExternalStyling to enable
 * className/style/rest merging for external style extension support.
 **/
export const ExportedButton = styled.button.withConfig({
  displayName: "ExportedButton",
})`
  background: #bf4f74;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
`;

// This is also exported but won't use shouldSupportExternalStyling (for comparison)
const InternalBox = styled.div`
  background: #f0f0f0;
  padding: 16px;
`;

export const App = () => (
  <div>
    <ExportedButton>Styled Button</ExportedButton>
    <InternalBox>Internal Box</InternalBox>
  </div>
);
