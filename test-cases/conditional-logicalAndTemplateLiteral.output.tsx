import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type TitleProps = React.PropsWithChildren<{
  upsideDown?: boolean;
}>;

// Test logical AND with static template literal
function Title(props: TitleProps) {
  const { children, upsideDown } = props;
  return <h1 sx={[styles.title, upsideDown && styles.titleUpsideDown]}>{children}</h1>;
}

type DropZoneProps = React.PropsWithChildren<{
  isDraggingOver: boolean;
}>;

// Test logical AND with template literal containing theme expression
export function DropZone(props: DropZoneProps) {
  const { children, isDraggingOver, ...rest } = props;
  return (
    <div {...rest} sx={[styles.dropZone, isDraggingOver && styles.dropZoneDraggingOver]}>
      {children}
    </div>
  );
}

type CardProps = React.PropsWithChildren<{
  isHighlighted: boolean;
}>;

// Test logical AND with template literal containing multiple theme expressions
export function Card(props: CardProps) {
  const { children, isHighlighted, ...rest } = props;
  return (
    <div {...rest} sx={[styles.card, isHighlighted && styles.cardHighlighted]}>
      {children}
    </div>
  );
}

type StatusBarProps = React.PropsWithChildren<{
  isDisconnected?: boolean;
}>;

// Test ternary with template literal containing theme expression and undefined alternate
// This is semantically equivalent to the logical AND form above
export function StatusBar(props: StatusBarProps) {
  const { children, isDisconnected, ...rest } = props;
  return (
    <div {...rest} sx={[styles.statusBar, isDisconnected && styles.statusBarDisconnected]}>
      {children}
    </div>
  );
}

export const App = () => (
  <div>
    <Title>Normal Title</Title>
    <Title upsideDown>Upside Down Title</Title>
    <DropZone isDraggingOver>Dragging</DropZone>
    <DropZone isDraggingOver={false}>Not dragging</DropZone>
    <Card isHighlighted>Highlighted</Card>
    <Card isHighlighted={false}>Normal</Card>
    <StatusBar isDisconnected>Disconnected</StatusBar>
    <StatusBar>Connected</StatusBar>
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
    padding: 16,
    borderRadius: 8,
    boxShadow: "0px 1px 2px rgba(0, 0, 0, 0.06)",
  },
  dropZoneDraggingOver: {
    boxShadow: `inset 0 0 0 1px ${$colors.primaryColor},0px 1px 2px rgba(0, 0, 0, 0.06)`,
  },
  card: {
    padding: 16,
  },
  cardHighlighted: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: $colors.primaryColor,
    boxShadow: `0 0 8px ${$colors.bgSub}`,
  },
  statusBar: {
    padding: 8,
  },
  statusBarDisconnected: {
    backgroundColor: $colors.bgSub,
  },
});
