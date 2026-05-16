import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { motion, type MotionValue } from "./lib/framer-motion";
import { UserAvatar } from "./lib/user-avatar";

type ComponentWrapperProps = { isOpen: boolean } & Omit<
  React.ComponentPropsWithRef<typeof motion.div>,
  "className"
>;

function ComponentWrapper(props: ComponentWrapperProps) {
  const { children, style, isOpen, ...rest } = props;
  const sx = stylex.props(styles.componentWrapper, isOpen && styles.componentWrapperOpen);

  return (
    <motion.div
      {...rest}
      {...sx}
      style={{
        ...sx.style,
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}

type HighlightedAvatarProps = { highlightColor?: string } & React.ComponentPropsWithRef<
  typeof UserAvatar
>;

function HighlightedAvatar(props: HighlightedAvatarProps) {
  const { className, style, highlightColor, ...rest } = props;
  return (
    <UserAvatar
      {...rest}
      {...mergedSx(
        styles.highlightedAvatar(`0 0 0 2px ${highlightColor ?? "transparent"}`),
        className,
        style,
      )}
    />
  );
}

type ZoomPreviewImageProps = {
  isZoomable: boolean;
  isDragging: boolean;
} & Omit<React.ComponentPropsWithRef<typeof motion.img>, "className" | "style">;

function ZoomPreviewImage(props: ZoomPreviewImageProps) {
  const { isDragging, isZoomable, ...rest } = props;
  return (
    <motion.img
      {...rest}
      {...stylex.props(
        styles.zoomPreviewImage,
        isDragging
          ? styles.zoomPreviewImage$isDragging
          : isZoomable
            ? styles.zoomPreviewImage$isZoomableTrue
            : styles.zoomPreviewImage$isZoomableFalse,
      )}
    />
  );
}

type MotionIframeWrapperProps = {
  svgWidth?: number;
  svgHeight?: number;
} & Omit<React.ComponentPropsWithRef<typeof motion.div>, "className" | "style">;

function MotionIframeWrapper(props: MotionIframeWrapperProps) {
  const { children, svgWidth, svgHeight, ...rest } = props;
  return (
    <motion.div
      {...rest}
      {...stylex.props(
        styles.motionIframeWrapper,
        styles.motionIframeWrapperWidth(svgWidth),
        styles.motionIframeWrapperAspectRatio(svgWidth, svgHeight),
      )}
    >
      {children}
    </motion.div>
  );
}

export const App = () => (
  <div>
    <ComponentWrapper
      isOpen={true}
      initial={{ height: 40 }}
      animate={{ height: 200 }}
      style={{ opacity: visibleOpacity }}
    >
      Open content
    </ComponentWrapper>
    <ComponentWrapper isOpen={false} initial={{ height: 40 }} animate={{ height: 40 }}>
      Closed
    </ComponentWrapper>
    <ZoomPreviewImage
      isDragging={false}
      isZoomable
      alt="Zoomable"
      src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
    />
    <ZoomPreviewImage
      isDragging
      isZoomable={false}
      alt="Dragging"
      src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
    />
    <MotionIframeWrapper svgWidth={160} svgHeight={90}>
      16:9 iframe
    </MotionIframeWrapper>
    <MotionIframeWrapper>Default iframe</MotionIframeWrapper>
    <HighlightedAvatar user="Alice" size="small" highlightColor="blue" />
    <HighlightedAvatar user="Bob" size="tiny" />
  </div>
);

const visibleOpacity: MotionValue<number> = {
  get: () => 1,
};

function getAspectRatio(svgWidth?: number, svgHeight?: number): string {
  return svgWidth && svgHeight ? `${svgWidth} / ${svgHeight}` : "16 / 9";
}

const styles = stylex.create({
  componentWrapper: {
    backgroundColor: "white",
    borderRadius: "20px",
    overflow: "hidden",
  },
  componentWrapperOpen: {
    borderRadius: "8px",
  },
  highlightedAvatar: (boxShadow: string) => ({
    borderRadius: "50%",
    boxShadow,
  }),
  zoomPreviewImage: {
    objectFit: "contain",
  },
  zoomPreviewImage$isDragging: {
    cursor: "grabbing",
  },
  zoomPreviewImage$isZoomableTrue: {
    cursor: "zoom-in",
  },
  zoomPreviewImage$isZoomableFalse: {
    cursor: "zoom-out",
  },
  motionIframeWrapper: {
    backgroundColor: "lavender",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "purple",
  },
  motionIframeWrapperWidth: (svgWidth: number | undefined) => ({
    width: svgWidth ? `${svgWidth}px` : "100%",
  }),
  motionIframeWrapperAspectRatio: (
    svgWidth: number | undefined,
    svgHeight: number | undefined,
  ) => ({
    aspectRatio: getAspectRatio(svgWidth, svgHeight),
  }),
});
