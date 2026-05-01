import React from "react";
import styled from "styled-components";
import { motion, type MotionValue } from "./lib/framer-motion";
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

const ZoomPreviewImage = styled(motion.img)<{
  $isZoomable: boolean;
  $isDragging: boolean;
}>`
  object-fit: contain;
  cursor: ${(props) => (props.$isDragging ? "grabbing" : props.$isZoomable ? "zoom-in" : "zoom-out")};
`;

export const App = () => (
  <div>
    <ComponentWrapper
      $isOpen={true}
      initial={{ height: 40 }}
      animate={{ height: 200 }}
      style={{ opacity: visibleOpacity }}
    >
      Open content
    </ComponentWrapper>
    <ComponentWrapper $isOpen={false} initial={{ height: 40 }} animate={{ height: 40 }}>
      Closed
    </ComponentWrapper>
    <ZoomPreviewImage
      $isDragging={false}
      $isZoomable
      alt="Zoomable"
      src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
    />
    <ZoomPreviewImage
      $isDragging
      $isZoomable={false}
      alt="Dragging"
      src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
    />
    <HighlightedAvatar user="Alice" size="small" $highlightColor="blue" />
    <HighlightedAvatar user="Bob" size="tiny" />
  </div>
);

const visibleOpacity: MotionValue<number> = {
  get: () => 1,
};
