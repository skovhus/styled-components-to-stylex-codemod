// @expected-warning: Prop-dependent dynamic style function cannot also carry a computed media-query override for the same property — split into static conditional styles or bind the media value separately
// A single declaration (`bottom`) depends on a prop AND varies inside a computed
// media block (`${screenSize.phone}`). The prop-dependent value is emitted as a
// dynamic StyleX style function, which cannot represent a computed media-query key
// — so the media branch would be SILENTLY dropped (only the default survives). The
// codemod must bail rather than emit that lossy conversion. StyleX can express a
// computed media key inside a dynamic function, but folding both branches into one
// is not built yet (the faithful manual fix splits into static conditional styles
// that carry both the default and the `[breakpoints.phone]` values).
import styled from "styled-components";
import { screenSize } from "./lib/helpers";

const BURN_UP_GRAPH_HEIGHT = 216;
const BURN_UP_GRAPH_HEIGHT_PHONE = 347;

// Ternary body → emitStyleFunctionFromPropsObject
const DateLine = styled.div<{ $extendForGraph?: boolean; $isFirstItem?: boolean }>`
  position: absolute;
  top: ${(props) => (props.$isFirstItem ? "0" : "4.5px")};
  bottom: ${(props) => (props.$extendForGraph ? `-${BURN_UP_GRAPH_HEIGHT}px` : "4.5px")};
  left: 65%;
  width: 1px;
  background-color: #ccc;
  transform: translateX(-50%);

  ${screenSize.phone} {
    bottom: ${(props) => (props.$extendForGraph ? `-${BURN_UP_GRAPH_HEIGHT_PHONE}px` : "0")};
    left: 100%;
  }
`;

// Direct prop passthrough → emitStyleFunction (the same lossy drop lived here too).
const OffsetLine = styled.div<{ $offset: string }>`
  bottom: ${({ $offset }) => $offset};

  ${screenSize.phone} {
    bottom: ${({ $offset }) => $offset};
  }
`;

// Destructured default → emitStyleFunctionWithDefault.
const PaddedLine = styled.div<{ $pad?: string }>`
  padding-top: ${({ $pad = "8px" }) => $pad};

  ${screenSize.phone} {
    padding-top: ${({ $pad = "2px" }) => $pad};
  }
`;

export function App() {
  return (
    <div style={{ position: "relative", height: 200, padding: 40 }}>
      <DateLine $extendForGraph $isFirstItem>
        A
      </DateLine>
      <DateLine>B</DateLine>
      <OffsetLine $offset="4px">C</OffsetLine>
      <PaddedLine>D</PaddedLine>
    </div>
  );
}
