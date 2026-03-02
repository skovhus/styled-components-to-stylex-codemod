// shouldForwardProp with conditional interpolations producing full CSS declarations
import * as React from "react";
import styled from "styled-components";

type JustifyValues =
  | "center"
  | "stretch"
  | "space-around"
  | "space-between"
  | "space-evenly"
  | "flex-start"
  | "flex-end";
type AlignValues = "stretch" | "center" | "baseline" | "flex-start" | "flex-end";

/** Props for the Flex component */
export type FlexProps = {
  /** Set `flex-direction` to `column` */
  column?: boolean;
  /** Set `align-self`. */
  alignSelf?: AlignValues;
  /** The classname to apply to the container. */
  className?: string;
  /** The children to render. */
  children?: React.ReactNode;
  /** Set `flex-wrap` value. */
  wrap?: boolean;
  /** Space between items */
  gap?: number;
  /** Space between wrapped lines, defaults to gap if not provided */
  wrapGap?: number;
};

/** Prop keys for the Flex component */
export const flexPropKeys = ["wrap", "alignSelf", "gap", "wrapGap", "column"];

/**
 * Generic flexbox div component.
 */
export const FlexBox = styled("div").withConfig({
  shouldForwardProp: (prop) => !flexPropKeys.includes(prop),
})<FlexProps>`
  ${({ wrap }) => (wrap ? "flex-wrap: wrap;" : "")};
  ${({ alignSelf }) => (alignSelf ? `align-self: ${alignSelf};` : "")};
  ${({ gap }) => (typeof gap === "number" ? `gap: ${gap}px` : "")};
  ${({ wrapGap, column }) => (typeof wrapGap === "number" ? `${column ? "column" : "row"}-gap: ${wrapGap}px` : "")};
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <FlexBox gap={8} style={{ background: "#e0e0ff", padding: 8 }}>
      <div style={{ background: "#7070ff", padding: 8, color: "white" }}>Gap 8</div>
      <div style={{ background: "#7070ff", padding: 8, color: "white" }}>Gap 8</div>
      <div style={{ background: "#7070ff", padding: 8, color: "white" }}>Gap 8</div>
    </FlexBox>
    <FlexBox wrap gap={4} style={{ background: "#ffe0e0", padding: 8, width: 200 }}>
      <div style={{ background: "#ff7070", padding: 8, color: "white" }}>Wrap</div>
      <div style={{ background: "#ff7070", padding: 8, color: "white" }}>Wrap</div>
      <div style={{ background: "#ff7070", padding: 8, color: "white" }}>Wrap</div>
      <div style={{ background: "#ff7070", padding: 8, color: "white" }}>Wrap</div>
    </FlexBox>
    <FlexBox alignSelf="center" style={{ background: "#e0ffe0", padding: 8 }}>
      <div style={{ background: "#70ff70", padding: 8 }}>Align Self Center</div>
    </FlexBox>
    <FlexBox column wrapGap={12} style={{ background: "#fff0d0", padding: 8 }}>
      <div style={{ background: "#ffb040", padding: 8 }}>Column Gap 12</div>
      <div style={{ background: "#ffb040", padding: 8 }}>Column Gap 12</div>
    </FlexBox>
    <FlexBox wrapGap={12} style={{ background: "#d0f0ff", padding: 8 }}>
      <div style={{ background: "#40b0ff", padding: 8, color: "white" }}>Row Gap 12</div>
      <div style={{ background: "#40b0ff", padding: 8, color: "white" }}>Row Gap 12</div>
    </FlexBox>
  </div>
);
