import React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";
import { motion, type MotionValue } from "./lib/framer-motion";
import { UserAvatar } from "./lib/user-avatar";

type ComponentWrapperProps = {
  sx?: stylex.StyleXStyles;
  isOpen: boolean;
} & Omit<React.ComponentPropsWithRef<typeof motion.div>, "className">;

function ComponentWrapper(props: ComponentWrapperProps) {
  const { style, sx, isOpen, ...rest } = props;
  const _sx = stylex.props(styles.componentWrapper, isOpen && styles.componentWrapperOpen, sx);

  return (
    <motion.div
      {...rest}
      {..._sx}
      style={{
        ..._sx.style,
        ...style,
      }}
    />
  );
}

type HighlightedAvatarProps = { highlightColor?: string } & Omit<
  React.ComponentPropsWithRef<typeof UserAvatar>,
  "className" | "style"
>;

function HighlightedAvatar(props: HighlightedAvatarProps) {
  const { highlightColor, ...rest } = props;
  return (
    <UserAvatar
      {...rest}
      {...stylex.props(styles.highlightedAvatar(`0 0 0 2px ${highlightColor ?? "transparent"}`))}
    />
  );
}

type PresenceAvatarProps = { highlightColor?: string } & Omit<
  React.ComponentPropsWithRef<typeof UserAvatar>,
  "className" | "style"
>;

function PresenceAvatar(props: PresenceAvatarProps) {
  const { highlightColor, ...rest } = props;
  const theme = useTheme();

  return (
    <UserAvatar
      {...rest}
      {...stylex.props(
        styles.presenceAvatar(
          {
            highlightColor,
          },
          theme,
        ),
      )}
    />
  );
}

type DestructuredShadowProps = React.PropsWithChildren<{
  blur: number;
  color: string;
}>;

function DestructuredShadow(props: DestructuredShadowProps) {
  const { children, blur, color } = props;
  return (
    <div
      sx={styles.destructuredShadowBoxShadow({
        blur,
        color,
      })}
    >
      {children}
    </div>
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
  const { svgWidth, svgHeight, ...rest } = props;
  return (
    <motion.div
      {...rest}
      {...stylex.props(
        styles.motionIframeWrapper,
        styles.motionIframeWrapperWidth(svgWidth),
        styles.motionIframeWrapperAspectRatio(svgWidth, svgHeight),
      )}
    />
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
    <PresenceAvatar user="Carol" size="small" highlightColor="green" />
    <PresenceAvatar user="Dave" size="tiny" />
    <DestructuredShadow blur={4} color="rgba(0, 0, 0, 0.35)">
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
  presenceAvatar: (props, theme) => ({
    borderRadius: "50%",
    margin: 2,
    transition: "box-shadow 0.3s ease-in-out",
    boxShadow: `0 0 0 1px ${$colors.bgBase},0 0 0 2px ${props.highlightColor ?? "transparent"},0 0 0 3px ${props.highlightColor ? theme.color.bgBase : "transparent"}`,
  }),
  destructuredShadowBoxShadow: (props) => ({
    boxShadow: `0 0 ${props.blur}px ${props.color}`,
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
