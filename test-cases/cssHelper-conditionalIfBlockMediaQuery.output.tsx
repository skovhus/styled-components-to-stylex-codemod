import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { Browser } from "./lib/helpers";

type EmojiContainerProps = { size: number } & Omit<
  React.ComponentProps<"div">,
  "className" | "style"
>;

/** A container for emojis that standardizes sizing across browsers */
export function EmojiContainer(props: EmojiContainerProps) {
  const { children, size, ...rest } = props;
  return (
    <div
      {...rest}
      sx={[
        styles.emojiContainer,
        styles.emojiContainerSize(size),
        Browser.isSafari
          ? styles.emojiContainerBrowserIsSafari(size)
          : styles.emojiContainerDefault(size),
      ]}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <EmojiContainer size={16}>🎉</EmojiContainer>
    <EmojiContainer size={24}>🚀</EmojiContainer>
    <EmojiContainer size={32}>✨</EmojiContainer>
  </div>
);

const styles = stylex.create({
  emojiContainer: {
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    wordBreak: "keep-all",
    height: "auto",
  },
  emojiContainerBrowserIsSafari: (size: number) => ({
    fontSize: {
      default: `${size - 4}px`,
      "@media (-webkit-min-device-pixel-ratio: 2),(min-resolution: 192dpi)": `${size - 3}px`,
    },
    lineHeight: {
      default: 1,
      "@media (-webkit-min-device-pixel-ratio: 2),(min-resolution: 192dpi)": `${size - 1}px`,
    },
  }),
  emojiContainerDefault: (size: number) => ({
    fontSize: {
      default: `${size - 3}px`,
      "@media (-webkit-min-device-pixel-ratio: 2),(min-resolution: 192dpi)": `${size - 1}px`,
    },
    lineHeight: {
      default: `${size}px`,
      "@media (-webkit-min-device-pixel-ratio: 2),(min-resolution: 192dpi)": `${size}px`,
    },
  }),
  emojiContainerSize: (size: number) => ({
    width: `${size}px`,
    maxWidth: `${size}px`,
    maxHeight: `${size}px`,
  }),
});
