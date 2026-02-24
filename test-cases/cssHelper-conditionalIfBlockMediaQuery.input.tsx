import styled, { css } from "styled-components";
import { Browser } from "./lib/helpers";

/** A container for emojis that standardizes sizing across browsers */
export const EmojiContainer = styled.div<{ $size: number }>`
  display: inline-flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  word-break: keep-all;
  width: ${(props) => props.$size}px;
  height: auto;
  max-width: ${(props) => props.$size}px;
  max-height: ${(props) => props.$size}px;

  ${(props) => {
    if (Browser.isSafari) {
      return css`
        font-size: ${props.$size - 4}px;
        line-height: 1;

        @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
          font-size: ${props.$size - 3}px;
          line-height: ${props.$size - 1}px;
        }
      `;
    }

    return css`
      font-size: ${props.$size - 3}px;
      line-height: ${props.$size}px;

      @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
        font-size: ${props.$size - 1}px;
        line-height: ${props.$size}px;
      }
    `;
  }}
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <EmojiContainer $size={16}>🎉</EmojiContainer>
    <EmojiContainer $size={24}>🚀</EmojiContainer>
    <EmojiContainer $size={32}>✨</EmojiContainer>
  </div>
);
