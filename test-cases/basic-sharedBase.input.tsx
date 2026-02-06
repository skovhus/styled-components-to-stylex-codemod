import styled from "styled-components";

/** Props for position-based styled components. */
interface PositionProps {
  /** Top position value. */
  top?: string;
  /** Right position value. */
  right?: string;
  /** Bottom position value. */
  bottom?: string;
  /** Left position value. */
  left?: string;
}

const PositionBase = styled("div")<PositionProps>`
  ${(props) => (props.top ? `top: ${props.top}` : "")};
  ${(props) => (props.right ? `right: ${props.right}` : "")};
  ${(props) => (props.bottom ? `bottom: ${props.bottom}` : "")};
  ${(props) => (props.left ? `left: ${props.left}` : "")};
`;

/** A relatively positioned container. */
export const Relative = styled(PositionBase)`
  position: relative;
`;

/** An absolutely positioned container. */
export const Absolute = styled(PositionBase)`
  position: absolute;
`;

export function App() {
  return (
    <div>
      <Relative top="10px" left="20px">
        Relative
      </Relative>
      <Absolute right="50px" bottom="15px">
        Absolute
      </Absolute>
    </div>
  );
}
