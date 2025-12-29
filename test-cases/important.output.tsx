import React from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  overrideButton: {
    backgroundColor: "#BF4F74",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    padding: "8px 16px",
    borderRadius: "4px",
  },
  forceWidth: {
    width: "100%",
    maxWidth: "500px",
    marginTop: 0,
    marginRight: "auto",
    marginBottom: 0,
    marginLeft: "auto",
  },
  mixedStyles: {
    fontSize: "16px",
    color: "#333",
    lineHeight: 1.5,
    margin: 0,
  },
  importantHover: {
    color: "#BF4F74",
    textDecoration: "none",
  },
  importantHoverHover: {
    color: "#4F74BF",
    textDecoration: "underline",
  },
});

export const App = () => {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div>
      <button {...stylex.props(styles.overrideButton)}>Should be pink despite inline style</button>
      <div {...stylex.props(styles.forceWidth)}>Full width content</div>
      <p {...stylex.props(styles.mixedStyles)}>Color and margin should be overridden</p>
      <a
        href="#"
        {...stylex.props(styles.importantHover, isHovered && styles.importantHoverHover)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        Hover me
      </a>
    </div>
  );
};
