import React from "react";
import styled from "styled-components";
import { motion } from "./lib/framer-motion";
import { UserAvatar } from "./lib/user-avatar";

const ComponentWrapper = styled(motion.div)<{ $isOpen: boolean }>`
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
    <ComponentWrapper $isOpen={true} initial={{ height: 40 }} animate={{ height: 200 }}>
      Open content
    </ComponentWrapper>
    <ComponentWrapper $isOpen={false} initial={{ height: 40 }} animate={{ height: 40 }}>
      Closed
    </ComponentWrapper>
    <HighlightedAvatar user="Alice" size="small" $highlightColor="blue" />
    <HighlightedAvatar user="Bob" size="tiny" />
  </div>
);
