// Partial conversion must preserve styled-components keyframes used by skipped styled templates.
import styled, { keyframes } from "styled-components";

const shimmer = keyframes`
  from {
    background-position: 0 50%;
  }

  to {
    background-position: 100% 50%;
  }
`;

const ConvertedText = styled.div`
  padding: 12px;
  color: #1d4ed8;
`;

const PreservedAnimatedText = styled.span`
  animation: ${shimmer} 1.2s linear infinite;
  background: linear-gradient(90deg, #60a5fa, #f472b6);
  background-size: 200% 100%;

  & a.active {
    color: tomato;
  }
`;

export const App = () => (
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <ConvertedText>Converted text</ConvertedText>
    <PreservedAnimatedText>
      <a className="active" href="#">
        Preserved animated text
      </a>
    </PreservedAnimatedText>
  </div>
);
