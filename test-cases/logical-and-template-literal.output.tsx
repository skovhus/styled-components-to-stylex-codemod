import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type TitleProps = React.PropsWithChildren<{
  $upsideDown?: boolean;
}>;

// Test logical AND with static template literal
function Title(props: TitleProps) {
  const { children, $upsideDown } = props;
  return <h1 {...stylex.props(styles.title, $upsideDown && styles.titleUpsideDown)}>{children}</h1>;
}

type DropZoneProps = React.PropsWithChildren<{
  $isDraggingOver: boolean;
}>;

// Test logical AND with template literal containing theme expression
export function DropZone(props: DropZoneProps) {
  const { children, $isDraggingOver } = props;
  return (
    <div {...stylex.props(styles.dropZone, $isDraggingOver && styles.dropZoneDraggingOver)}>
      {children}
    </div>
  );
}

type CardProps = React.PropsWithChildren<{
  $isHighlighted: boolean;
}>;

// Test logical AND with template literal containing multiple theme expressions
export function Card(props: CardProps) {
  const { children, $isHighlighted } = props;
  return (
    <div {...stylex.props(styles.card, $isHighlighted && styles.cardHighlighted)}>{children}</div>
  );
}

export const App = () => (
  <div>
    <Title>Normal Title</Title>
    <Title $upsideDown>Upside Down Title</Title>
    <DropZone $isDraggingOver>Dragging</DropZone>
    <DropZone $isDraggingOver={false}>Not dragging</DropZone>
    <Card $isHighlighted>Highlighted</Card>
    <Card $isHighlighted={false}>Normal</Card>
  </div>
);

const styles = stylex.create({
  title: {
    textAlign: "center",
    color: "#bf4f74",
  },
  titleUpsideDown: {
    transform: "rotate(180deg)",
  },
  dropZone: {
    padding: "16px",
    borderRadius: "8px",
    boxShadow: "0px 1px 2px rgba(0, 0, 0, 0.06)",
  },
  dropZoneDraggingOver: {
    boxShadow: `inset 0 0 0 1px ${$colors.primaryColor}, 0px 1px 2px rgba(0, 0, 0, 0.06)`,
  },
  card: {
    padding: "16px",
  },
  cardHighlighted: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: `${$colors.primaryColor}`,
    boxShadow: `0 0 8px ${$colors.bgSub}`,
  },
});
