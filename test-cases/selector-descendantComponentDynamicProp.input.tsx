// Forward descendant component selector with dynamic prop-based interpolation
import styled from "styled-components";

const Icon = styled.span`
  width: 16px;
  height: 16px;
`;

// Forward descendant selector with prop-based interpolation.
// The prop value is bridged to the child via a CSS custom property.
const Button = styled.button<{ $color?: string }>`
  padding: 8px;

  &:hover ${Icon} {
    color: ${(props) => props.$color ?? "red"};
  }
`;

// Static parts around the interpolation must be preserved in the var() reference
// (e.g., `box-shadow: 0 4px 8px ${color}` → `"0 4px 8px var(--name)"`).
const Badge = styled.span`
  font-size: 12px;
`;

const Card = styled.div<{ $shadow?: string }>`
  padding: 16px;
  background: white;

  &:hover ${Badge} {
    box-shadow: 0 4px 8px ${(props) => props.$shadow ?? "rgba(0,0,0,0.2)"};
  }
`;

// Shorthand border with interpolation: static longhands stay static,
// dynamic color is bridged via CSS variable.
const Tag = styled.span`
  display: inline-block;
`;

const Toolbar = styled.div<{ $accent?: string }>`
  display: flex;
  gap: 8px;

  &:hover ${Tag} {
    border: 2px solid ${(props) => props.$accent ?? "gray"};
  }
`;

// Multiple pseudo selectors targeting the same child with the same CSS property
// must produce unique CSS variable names per pseudo to avoid collisions.
const Dot = styled.span`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: gray;
`;

const Toggle = styled.div<{ $hoverColor?: string; $focusColor?: string }>`
  padding: 8px;

  &:hover ${Dot} {
    color: ${(props) => props.$hoverColor ?? "blue"};
  }

  &:focus ${Dot} {
    color: ${(props) => props.$focusColor ?? "green"};
  }
`;

// Destructured arrow params must also register shouldForwardProp drops
const Chip = styled.span`
  font-size: 14px;
`;

const ChipGroup = styled.div<{ $chipColor?: string }>`
  display: flex;
  gap: 4px;

  &:hover ${Chip} {
    color: ${({ $chipColor }) => $chipColor ?? "purple"};
  }
`;

// Grouped parent pseudos must bridge the dynamic value into every pseudo bucket.
const GroupedLabel = styled.span`
  font-size: 14px;
`;

const GroupedPanel = styled.div<{ $tone?: string }>`
  padding: 8px;
  border: 1px solid #ccc;

  &:hover,
  &:focus-within {
    ${GroupedLabel} {
      color: ${(props) => props.$tone ?? "darkgreen"};
    }
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <Button $color="blue">
      <Icon />
      Button hover → Icon color
    </Button>
    <Card $shadow="rgba(0,0,255,0.3)">
      <Badge>Card hover → Badge shadow</Badge>
    </Card>
    <Toolbar $accent="red">
      <Tag>Toolbar hover → Tag border</Tag>
    </Toolbar>
    <Toggle $hoverColor="red" $focusColor="orange">
      <Dot>Hover vs Focus</Dot>
    </Toggle>
    <ChipGroup $chipColor="teal">
      <Chip>Destructured prop</Chip>
    </ChipGroup>
    <GroupedPanel $tone="seagreen">
      <button type="button">
        <GroupedLabel>Grouped hover/focus dynamic color</GroupedLabel>
      </button>
    </GroupedPanel>
  </div>
);
