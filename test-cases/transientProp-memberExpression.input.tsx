import React from "react";
import styled from "styled-components";
import { color } from "./lib/helpers";
import { motion, type MotionValue } from "./lib/framer-motion";
import { $colors as $glowShadow } from "./tokens.stylex";
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

const PresenceAvatar = styled(UserAvatar)<{ $highlightColor?: string }>`
  box-shadow:
    0 0 0 1px ${color("bgBase")},
    0 0 0 2px ${(props) => props.$highlightColor ?? "transparent"},
    0 0 0 3px ${(props) => (props.$highlightColor ? props.theme.color.bgBase : "transparent")};
  border-radius: 50%;
  margin: 2px;
  transition: box-shadow 0.3s ease-in-out;
`;

const DestructuredShadow = styled.div<{ $blur: number; $glowShadow: string }>`
  box-shadow: 0 0 ${({ $blur }) => $blur}px ${({ $glowShadow }) => $glowShadow};
`;

const ZoomPreviewImage = styled(motion.img)<{
  $isZoomable: boolean;
  $isDragging: boolean;
}>`
  object-fit: contain;
  cursor: ${(props) => (props.$isDragging ? "grabbing" : props.$isZoomable ? "zoom-in" : "zoom-out")};
`;

const MotionIframeWrapper = styled(motion.div)<{
  $svgWidth?: number;
  $svgHeight?: number;
}>`
  width: ${(props) => (props.$svgWidth ? `${props.$svgWidth}px` : "100%")};
  aspect-ratio: ${(props) => getAspectRatio(props.$svgWidth, props.$svgHeight)};
  background: lavender;
  border: 2px solid purple;
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
    <MotionIframeWrapper $svgWidth={160} $svgHeight={90}>
      16:9 iframe
    </MotionIframeWrapper>
    <MotionIframeWrapper>Default iframe</MotionIframeWrapper>
    <HighlightedAvatar user="Alice" size="small" $highlightColor="blue" />
    <HighlightedAvatar user="Bob" size="tiny" />
    <PresenceAvatar user="Carol" size="small" $highlightColor="green" />
    <PresenceAvatar user="Dave" size="tiny" />
    <DestructuredShadow $blur={4} $glowShadow="rgba(0, 0, 0, 0.35)">
      Destructured shadow
    </DestructuredShadow>
  </div>
);

const visibleOpacity: MotionValue<number> = {
  get: () => 1,
};

function getAspectRatio(svgWidth?: number, svgHeight?: number): string {
  return svgWidth && svgHeight ? `${svgWidth} / ${svgHeight}` : "16 / 9";
}
