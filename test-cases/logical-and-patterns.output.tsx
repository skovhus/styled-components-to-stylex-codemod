import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type LayeredBoxProps = React.PropsWithChildren<{
  $zIndex?: number;
}>;

// Pattern 1: props.$zIndex !== undefined && template literal with interpolation
function LayeredBox(props: LayeredBoxProps) {
  const { children, $zIndex } = props;

  return (
    <div
      {...stylex.props(
        styles.layeredBox,
        $zIndex !== undefined && styles.layeredBoxZIndex($zIndex),
      )}
    >
      {children}
    </div>
  );
}

type GrayscaleImageProps = Omit<React.ComponentProps<"img">, "className" | "style"> & {
  $isBw?: boolean;
};

// Pattern 2: Simple logical AND with css helper (using destructured props)
function GrayscaleImage(props: GrayscaleImageProps) {
  const { $isBw, ...rest } = props;

  return (
    <img
      {...rest}
      {...stylex.props(styles.grayscaleImage, $isBw ? styles.grayscaleImageBw : undefined)}
    />
  );
}

type DialogTextProps = React.PropsWithChildren<{
  $renderingContext?: "dialog" | "page";
  $lines?: number;
}>;

// Pattern 3: Chained logical expressions with multiple conditions
function DialogText(props: DialogTextProps) {
  const { children, $renderingContext, $lines } = props;

  return (
    <p
      {...stylex.props(
        styles.dialogText,
        $renderingContext === "dialog" &&
          $lines === 1 &&
          styles.dialogTextRenderingContextDialogLines1,
      )}
    >
      {children}
    </p>
  );
}

export const App = () => (
  <div>
    {/* Pattern 1: with and without $zIndex */}
    <LayeredBox $zIndex={5}>With z-index</LayeredBox>
    <LayeredBox>Without z-index</LayeredBox>

    {/* Pattern 2: with and without $isBw */}
    <GrayscaleImage $isBw src="https://picsum.photos/100" />
    <GrayscaleImage $isBw={false} src="https://picsum.photos/100" />

    {/* Pattern 3: various condition combinations */}
    <DialogText $renderingContext="dialog" $lines={1}>
      Both conditions met
    </DialogText>
    <DialogText $renderingContext="dialog" $lines={2}>
      Only renderingContext met
    </DialogText>
    <DialogText $renderingContext="page" $lines={1}>
      Only lines met
    </DialogText>
    <DialogText>Neither condition met</DialogText>
  </div>
);

const styles = stylex.create({
  // Pattern 1: props.$zIndex !== undefined && template literal with interpolation
  layeredBox: {
    position: "absolute",
  },
  layeredBoxZIndex: (zIndex: number) => ({
    zIndex,
  }),

  grayscaleImage: {
    width: "100px",
  },
  grayscaleImageBw: {
    filter: "grayscale(100%)",
  },
  dialogText: {
    fontSize: "14px",
  },
  dialogTextRenderingContextDialogLines1: {
    backgroundColor: "hotpink",
  },
});
