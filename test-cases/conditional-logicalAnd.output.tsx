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

type GrayscaleImageProps = { isBw?: boolean } & Omit<
  React.ComponentProps<"img">,
  "className" | "style" | "sx"
>;

// Pattern 2: Simple logical AND with css helper (using destructured props)
function GrayscaleImage(props: GrayscaleImageProps) {
  const { isBw, ...rest } = props;
  return <img {...rest} sx={[styles.grayscaleImage, isBw && styles.grayscaleImageBw]} />;
}

type DialogTextProps = {
  renderingContext?: "dialog" | "page";
  lines?: number;
} & Omit<React.ComponentProps<"p">, "className" | "style" | "sx">;

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
  const { isDraggingOver, ...rest } = props;
  return <div {...rest} sx={[styles.dropZone, isDraggingOver && styles.dropZoneDraggingOver]} />;
}

type CardProps = React.PropsWithChildren<{
  isHighlighted: boolean;
}>;

// Pattern 5: Logical AND with template literal containing multiple theme expressions
export function Card(props: CardProps) {
  const { isHighlighted, ...rest } = props;
  return <div {...rest} sx={[styles.card, isHighlighted && styles.cardHighlighted]} />;
}

type StatusBarProps = React.PropsWithChildren<{
  isDisconnected?: boolean;
}>;

// Pattern 6: Ternary with template literal containing theme expression and undefined alternate
export function StatusBar(props: StatusBarProps) {
  const { isDisconnected, ...rest } = props;
  return <div {...rest} sx={[styles.statusBar, isDisconnected && styles.statusBarDisconnected]} />;
}

type LateOverrideProps = { hot?: boolean } & Omit<
  React.ComponentProps<"div">,
  "className" | "style" | "sx"
>;

// Pattern 7: Conditional block BEFORE an unconditional declaration of the same
// property — the later base declaration always wins (CSS cascade: last
// declaration in the generated class), so the conditional color is dead
function LateOverride(props: LateOverrideProps) {
  const { hot, ...rest } = props;
  return <div {...rest} sx={styles.lateOverride} />;
}

type ImportantBlockProps = React.PropsWithChildren<{
  hot?: boolean;
}>;

// Pattern 8: An `!important` conditional still wins over a LATER non-important
// base declaration of the same property (CSS importance beats source order), so
// the variant must be preserved rather than cleared. Covers both the css-block
// form and the ternary-with-undefined-alternate form.
function ImportantBlock(props: ImportantBlockProps) {
  const { children, hot } = props;
  return <div sx={[styles.importantBlock, hot && styles.importantBlockHot]}>{children}</div>;
}

type ImportantTernaryProps = React.PropsWithChildren<{
  hot?: boolean;
}>;

function ImportantTernary(props: ImportantTernaryProps) {
  const { children, hot } = props;
  return <div sx={[styles.importantTernary, hot && styles.importantTernaryHot]}>{children}</div>;
}

type ImportantNumericProps = React.PropsWithChildren<{
  hot?: boolean;
}>;

// Numeric `!important` conditional value (importance must survive even though
// the resolved branch is a number, not a string literal).
function ImportantNumeric(props: ImportantNumericProps) {
  const { children, hot } = props;
  return <div sx={[styles.importantNumeric, hot && styles.importantNumericHot]}>{children}</div>;
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

    {/* Pattern 7: later base declaration wins over the earlier conditional */}
    <LateOverride hot>Hot (still blue)</LateOverride>
    <LateOverride>Default (blue)</LateOverride>

    {/* Pattern 8: !important conditional wins over the later non-important base */}
    <ImportantBlock hot>Hot (red, important)</ImportantBlock>
    <ImportantBlock>Default (blue)</ImportantBlock>
    <ImportantTernary hot>Hot (red, important)</ImportantTernary>
    <ImportantTernary>Default (blue)</ImportantTernary>
    <ImportantNumeric hot>Hot (opacity 1, important)</ImportantNumeric>
    <ImportantNumeric>Default (opacity 0.5)</ImportantNumeric>
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
    borderWidth: 1,
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
  lateOverride: {
    color: "blue",
    padding: 4,
  },
  importantBlock: {
    color: "blue",
    padding: 4,
  },
  importantBlockHot: {
    color: "red !important",
  },
  importantTernary: {
    color: "blue",
    padding: 4,
  },
  importantTernaryHot: {
    color: "red !important",
  },
  importantNumeric: {
    opacity: 0.5,
    padding: 4,
  },
  importantNumericHot: {
    opacity: "1 !important",
  },
});
