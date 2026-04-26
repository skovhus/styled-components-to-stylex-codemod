import styled from "styled-components";

const color1 = "#ff0000";
const color2 = "#0000ff";
const color3 = "#00ff00";

const LinearGradientBox = styled.div`
  background: linear-gradient(${color1}, ${color2});
  width: 200px;
  height: 100px;
`;

const RadialGradientBox = styled.div`
  background: radial-gradient(${color1}, ${color2});
  width: 200px;
  height: 100px;
`;

const ConicGradientBox = styled.div`
  background: conic-gradient(${color1}, ${color2}, ${color3});
  width: 200px;
  height: 100px;
`;

const RepeatingLinearGradientBox = styled.div`
  background: repeating-linear-gradient(${color1} 0%, ${color2} 10%);
  width: 200px;
  height: 100px;
`;

// Multiple interpolations in a transform value
// Should produce a single template literal preserving all transform functions
const Popover = styled.div<{ $expanded: boolean }>`
  transform: translateY(-50%) translateX(${(props) => (props.$expanded ? "0" : "-8px")}) scale(${(props) => (props.$expanded ? 1 : 0.9)});
  opacity: ${(props) => (props.$expanded ? 1 : 0)};
`;

export const App = () => (
  <>
    <LinearGradientBox>Linear</LinearGradientBox>
    <RadialGradientBox>Radial</RadialGradientBox>
    <ConicGradientBox>Conic</ConicGradientBox>
    <RepeatingLinearGradientBox>Repeating</RepeatingLinearGradientBox>
    <Popover $expanded={true}>Expanded</Popover>
    <Popover $expanded={false}>Collapsed</Popover>
  </>
);
