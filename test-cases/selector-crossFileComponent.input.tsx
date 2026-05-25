import styled from "styled-components";
import { CrossFileIcon, CrossFileLink, TruncatedLabel } from "./lib/cross-file-icon.styled";

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  background-color: #f0f0f0;
  cursor: pointer;
`;

const IconButton = styled(Button)`
  gap: 8px;

  ${CrossFileIcon} {
    width: 30px;
    height: 30px;
    transition: transform 0.2s;
  }

  &:hover ${CrossFileIcon} {
    transform: rotate(180deg);
  }
`;

// Grouped parent pseudos AND a base rule that sets the SAME property as the
// grouped-pseudo rule. The base value (opacity: 0) must survive as `default`.
const HoverFocusButton = styled(Button)`
  gap: 8px;

  ${CrossFileIcon} {
    opacity: 0;
  }

  &:hover,
  &:focus-within {
    ${CrossFileIcon} {
      opacity: 1;
    }
  }
`;

const CloneButton = styled(Button)`
  ${CrossFileIcon} {
    background-color: transparent !important;
  }
`;

const LabelButton = styled(Button)`
  ${TruncatedLabel} {
    color: #475569;
  }

  &:hover ${TruncatedLabel} {
    color: #0f172a;
    text-decoration: underline;
  }
`;

const ExternalSummary = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid #cbd5e1;

  ${CrossFileIcon} {
    width: 20px;
    height: 20px;
  }

  ${CrossFileLink} {
    color: #2563eb;
    text-decoration: none;
  }

  &:hover ${CrossFileIcon} {
    transform: scale(1.2);
  }

  &:hover ${CrossFileLink} {
    color: #1d4ed8;
    text-decoration: underline;
  }
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16, width: 760 }}>
      <CrossFileIcon />
      <IconButton>
        <CrossFileIcon />
        Hover
      </IconButton>
      <HoverFocusButton>
        <CrossFileIcon />
        Hover or focus
      </HoverFocusButton>
      <CloneButton>
        <CrossFileIcon />
        Clone
      </CloneButton>
      <LabelButton>
        <TruncatedLabel>Exported selector label</TruncatedLabel>
      </LabelButton>
      <ExternalSummary>
        <CrossFileIcon />
        <CrossFileLink href="#">External link</CrossFileLink>
      </ExternalSummary>
    </div>
  );
}
