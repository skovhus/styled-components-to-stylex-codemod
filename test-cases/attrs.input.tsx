import * as React from "react";
import styled from "styled-components";
import { focusOutline } from "./lib/helpers";

// Simulated imported component
const Flex = (
  props: React.ComponentProps<"div"> & { column?: boolean; center?: boolean; focusIndex?: number },
) => {
  const { column, center, focusIndex, ...rest } = props;
  return <div data-focus-index={focusIndex} {...rest} />;
};

// Pattern 1: styled.input.attrs (dot notation)
const Input = styled.input.attrs<{ $padding?: string; $small?: boolean }>((props) => ({
  type: "text",
  size: props.$small ? 5 : undefined,
}))`
  border-radius: 3px;
  border: 1px solid #bf4f74;
  display: block;
  margin: 0 0 1em;
  padding: ${(props) => props.$padding};

  &::placeholder {
    color: #bf4f74;
  }
`;

// Pattern 2: styled("input").attrs (function call + attrs)
export interface TextInputProps {
  allowPMAutofill?: boolean;
  // Data attribute used by 1Password to control autofill behavior
  "data-1p-ignore"?: boolean;
}

export const TextInput = styled("input").attrs<TextInputProps>((props) => ({
  "data-1p-ignore": props.allowPMAutofill !== true,
}))<TextInputProps>`
  height: 32px;
  padding: 8px;
  background: white;
`;

// Pattern 3: styled(Component).attrs with object
// This pattern passes static attrs as an object
interface BackgroundProps {
  loaded: boolean;
}

export const Background = styled(Flex).attrs({
  column: true,
  center: true,
})<BackgroundProps>`
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: ${(props) => (props.loaded ? 0 : 1)};
`;

// Pattern 4: styled(Component).attrs with function (from Scrollable.tsx)
// This pattern computes attrs from props
interface ScrollableProps {
  gutter?: string;
}

export const Scrollable = styled(Flex).attrs((props) => ({
  tabIndex: props.tabIndex ?? 0,
}))<ScrollableProps>`
  overflow-y: auto;
  position: relative;
`;

// Pattern 5: styled(Component).attrs with TYPE ALIAS (not interface)
// This is the exact pattern from a design system's Scrollable.tsx
type TypeAliasProps = {
  /** Whether scrollbar gutter should be stable */
  gutter?: "auto" | "stable" | string;
  /** Whether to apply background color */
  $applyBackground?: boolean;
};

export const ScrollableWithType = styled(Flex).attrs((props) => ({
  tabIndex: props.tabIndex ?? 0,
}))<TypeAliasProps>`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
`;

// Pattern 6: defaultAttrs with different prop name than attr name
// When jsxProp !== attrName, the source prop must still be forwarded to the wrapped component
// E.g., tabIndex: props.focusIndex ?? 0 means focusIndex should still be passed through
interface FocusableProps {
  focusIndex?: number;
}

export const FocusableScroll = styled(Flex).attrs((props) => ({
  tabIndex: props.focusIndex ?? 0,
}))<FocusableProps>`
  overflow-y: auto;
`;

// Pattern 7: styled.div.attrs with prop reference (native element)
// When an intrinsic element has defaultAttrs, it generates a wrapper component
// that destructures the referenced prop and applies the default value
const Box = styled.div.attrs((props) => ({
  tabIndex: props.tabIndex ?? 0,
}))`
  overflow: auto;
`;

// Pattern 8: defaultAttrs with same-name prop that IS in base component's explicit props
// Verifies no duplication when attrName === jsxProp and prop is in baseExplicitProps
export const AlignedFlex = styled(Flex).attrs((props) => ({
  column: props.column ?? true,
}))<{}>`
  align-items: center;
`;

// Pattern 9: static attrs with a style object
// The inline style properties should be preserved in the output
const NoWrapText = styled.span.attrs({
  style: {
    whiteSpace: "nowrap" as const,
  },
})`
  color: blue;
`;

// Pattern 10: dynamic attrs with computed style object
// The dynamic inline styles should be preserved as inline style prop
const DynamicHeightBox = styled.div.attrs<{ $height: number }>(({ $height }) => ({
  style: {
    height: $height ? `${$height}px` : undefined,
  },
}))`
  display: flex;
  align-items: center;
`;

// Pattern 11: dynamic attrs style must be applied as style, not leaked as an inert DOM prop
const PositionedTile = styled.div.attrs<{ height: number }>((props) => ({
  style: {
    height: props.height,
  },
}))`
  position: absolute;
  min-height: 1px;
  background-color: #eef2ff;

  &:focus-visible {
    ${focusOutline}
    outline-offset: 3px;
  }
`;

// Pattern 12: dynamic attrs style should merge with caller style, with caller style last
const SeparatorLine = styled.div.attrs<{ $height?: number }>((props) => ({
  style: {
    height: props.$height ?? 1,
  },
}))`
  width: 100%;
  background-color: #94a3b8;
`;

const FallbackSeparatorLine = styled.div.attrs<{ $height?: number }>(({ $height }) => ({
  style: {
    height: $height ? `${$height}px` : "16px",
  },
}))`
  width: 100%;
  background-color: #16a34a;
`;

function HeaderSeparator(props: {
  className?: string;
  height?: number;
  style?: React.CSSProperties;
}) {
  const { className, height, style } = props;
  return <SeparatorLine $height={height} className={className} style={style} />;
}

// Pattern 13: attrs on a base wrapper must be inherited by styled extensions
type ButtonLikeProps = React.PropsWithChildren<{
  className?: string;
  size?: "small" | "medium";
  style?: React.CSSProperties;
  variant?: "borderless" | "solid";
}>;

function ButtonLike(props: ButtonLikeProps) {
  const { children, className, size, style, variant } = props;
  return (
    <button className={className} data-size={size} data-variant={variant} style={style}>
      {children}
    </button>
  );
}

const BaseToolbarButton = styled(ButtonLike).attrs({
  size: "small",
  variant: "borderless",
})`
  padding: 4px 8px;
`;

const ActiveToolbarButton = styled(BaseToolbarButton)`
  color: #4338ca;
  background-color: #e0e7ff;
`;

export const App = () => (
  <>
    <Input $small placeholder="Small" />
    <Input placeholder="Normal" />
    <Input $padding="2em" placeholder="Padded" />
    <TextInput placeholder="Text input" />
    <Background loaded={false}>Content</Background>
    <Scrollable>Scrollable content</Scrollable>
    <ScrollableWithType gutter="stable">Type alias scrollable</ScrollableWithType>
    <FocusableScroll focusIndex={5}>Focus content</FocusableScroll>
    <Box>Box content</Box>
    <AlignedFlex>Aligned content</AlignedFlex>
    <NoWrapText>No wrapping text</NoWrapText>
    <DynamicHeightBox $height={50}>Dynamic height</DynamicHeightBox>
    <PositionedTile height={64}>Tile with attrs height</PositionedTile>
    <HeaderSeparator height={2} style={{ opacity: 1 }} />
    <FallbackSeparatorLine $height={4}>Fallback separator</FallbackSeparatorLine>
    <ActiveToolbarButton>Inherited attrs</ActiveToolbarButton>
  </>
);
