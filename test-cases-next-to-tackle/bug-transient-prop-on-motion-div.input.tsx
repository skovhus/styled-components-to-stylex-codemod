import React from "react";
import styled from "styled-components";
import { motion } from "./lib/framer-motion";
import { UserAvatar } from "./lib/user-avatar";

// Bug: styled(motion.div)<{ $isOpen: boolean }> converts but the codemod
// may inline the usage, passing the transient $isOpen prop directly to
// motion.div which doesn't accept it. Similarly, styled(UserAvatar)<{ $highlight }>
// leaks $highlight to UserAvatar. styled-components auto-strips $-prefixed props.

const PulseWrapper = styled(motion.div)<{ $isOpen: boolean }>`
  background: white;
  border-radius: ${(props) => (props.$isOpen ? "8px" : "20px")};
  overflow: hidden;
`;

const HighlightedAvatar = styled(UserAvatar)<{ $highlightColor?: string }>`
  box-shadow: 0 0 0 2px ${(props) => props.$highlightColor ?? "transparent"};
  border-radius: 50%;
`;

export const App = () => (
  <div>
    <PulseWrapper $isOpen={true} initial={{ height: 40 }} animate={{ height: 200 }}>
      Open content
    </PulseWrapper>
    <PulseWrapper $isOpen={false} initial={{ height: 40 }} animate={{ height: 40 }}>
      Closed
    </PulseWrapper>
    <HighlightedAvatar user="Alice" size="small" $highlightColor="blue" enablePresence={false} />
    <HighlightedAvatar user="Bob" size="tiny" enablePresence={false} />
  </div>
);
