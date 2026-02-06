import styled from "styled-components";
import { color } from "./lib/helpers";

// Bug: A three-level styled chain (Sentence → PaddedSentence → PaddedMutedSentence)
// where the base component is used before its declaration. The codemod must correctly
// delegate styles through the chain without losing intermediate styles.

export function App() {
  return (
    <>
      <Sentence>Test</Sentence>
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
