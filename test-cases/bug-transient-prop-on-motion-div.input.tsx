import React from "react";
import styled from "styled-components";
import { motion } from "./lib/framer-motion";

// Bug: styled(motion.div)<{ $isOpen: boolean }> is converted, but the output
// passes the transient $isOpen prop directly to motion.div which doesn't accept it.
// Also, stylex.props() spreads data-style-src onto motion.div which rejects it.

const PulseWrapper = styled(motion.div)<{ $isOpen: boolean }>`
  background: white;
  border-radius: ${(props) => (props.$isOpen ? "8px" : "20px")};
  overflow: hidden;
`;

export const App = () => (
  <div>
    <PulseWrapper $isOpen={true} initial={{ height: 40 }} animate={{ height: 200 }}>
      Open content
    </PulseWrapper>
    <PulseWrapper $isOpen={false} initial={{ height: 40 }} animate={{ height: 40 }}>
      Closed
    </PulseWrapper>
  </div>
);
