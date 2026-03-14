import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type LayeredBoxProps = React.PropsWithChildren<{
  zIndex?: number;
}>;

// Pattern 1: props.$zIndex !== undefined && template literal with interpolation
function LayeredBox(props: LayeredBoxProps) {
  const { children, zIndex } = props;
  return (
    <div sx={[styles.layeredBox, zIndex !== undefined && styles.layeredBoxZIndex(zIndex)]}>
      {children}
    </div>
  );
}

type GrayscaleImageProps = { isBw?: boolean } & Pick<React.ComponentProps<"img">, "src">;

// Pattern 2: Simple logical AND with css helper (using destructured props)
function GrayscaleImage(props: GrayscaleImageProps) {
  const { isBw, ...rest } = props;
  return <img {...rest} sx={[styles.grayscaleImage, isBw && styles.grayscaleImageBw]} />;
}

type DialogTextProps = React.PropsWithChildren<{
  renderingContext?: "dialog" | "page";
  lines?: number;
}>;

// Pattern 3: Chained logical expressions with multiple conditions
function DialogText(props: DialogTextProps) {
  const { children, renderingContext, lines } = props;
  return (
    <p
      sx={[
        styles.dialogText,
        renderingContext === "dialog" &&
          lines === 1 &&
          styles.dialogTextRenderingContextDialogLines1,
      ]}
    >
      {children}
    </p>
  );
}

type DropZoneProps = React.PropsWithChildren<{
  isDraggingOver: boolean;
}>;

// Pattern 4: Logical AND with template literal containing theme expression
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

// Pattern 5: Logical AND with template literal containing multiple theme expressions
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

// Pattern 6: Ternary with template literal containing theme expression and undefined alternate
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
    {/* Pattern 1: with and without $zIndex */}
    <LayeredBox zIndex={5}>With z-index</LayeredBox>
    <LayeredBox>Without z-index</LayeredBox>

    {/* Pattern 2: with and without $isBw */}
    <GrayscaleImage isBw src="https://picsum.photos/100" />
    <GrayscaleImage isBw={false} src="https://picsum.photos/100" />

    {/* Pattern 3: various condition combinations */}
    <DialogText renderingContext="dialog" lines={1}>
      Both conditions met
    </DialogText>
    <DialogText renderingContext="dialog" lines={2}>
      Only renderingContext met
    </DialogText>
    <DialogText renderingContext="page" lines={1}>
      Only lines met
    </DialogText>
    <DialogText>Neither condition met</DialogText>

    {/* Pattern 4-6: logical AND / ternary with theme template literals */}
    <DropZone isDraggingOver>Dragging</DropZone>
    <DropZone isDraggingOver={false}>Not dragging</DropZone>
    <Card isHighlighted>Highlighted</Card>
    <Card isHighlighted={false}>Normal</Card>
    <StatusBar isDisconnected>Disconnected</StatusBar>
    <StatusBar>Connected</StatusBar>
  </div>
);

const styles = stylex.create({
  layeredBox: {
    position: "absolute",
  },
  layeredBoxZIndex: (zIndex: number) => ({
    zIndex,
  }),
  grayscaleImage: {
    width: 100,
  },
  grayscaleImageBw: {
    filter: "grayscale(100%)",
  },
  dialogText: {
    fontSize: 14,
  },
  dialogTextRenderingContextDialogLines1: {
    backgroundColor: "hotpink",
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
