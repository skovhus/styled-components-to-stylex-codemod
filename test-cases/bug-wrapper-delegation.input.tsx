import styled from "styled-components";
import { color } from "./lib/helpers";

export function App() {
  return (
    <>
      <PaddedMutedSentence style={{ marginBottom: 0 }}>Test</PaddedMutedSentence>
      <PaddedSentence>Okay</PaddedSentence>
    </>
  );
}
App.displayName = "App";

const Sentence = styled.div`
  text-align: center;
  margin-bottom: 32px;
`;

const PaddedSentence = styled(Sentence)`
  padding: 0 32px;
`;

const PaddedMutedSentence = styled(PaddedSentence)`
  color: ${color("labelMuted")};
`;
