// Attribute fallbacks outside nested @supports must be preserved.
import styled from "styled-components";

const CollapsibleRegion = styled.div`
  overflow: hidden;
  height: 0;
  opacity: 0;
  transition-property: opacity, height;

  &[data-open="true"] {
    height: auto;
    opacity: 1;
  }

  @supports (interpolate-size: allow-keywords) {
    interpolate-size: allow-keywords;

    @supports (height: calc-size(auto, size)) {
      height: calc-size(auto, size * 0);

      &[data-open="true"] {
        height: calc-size(auto, size);
      }
    }
  }
`;

const SupportsHoverOrder = styled.div`
  color: black;

  @supports (color: color(display-p3 1 0 0)) {
    &:hover {
      color: color(display-p3 1 0 0);
    }

    color: blue;
  }
`;

export const App = () => (
  <div>
    <CollapsibleRegion data-open="true">
      <div>Open content</div>
    </CollapsibleRegion>
    <SupportsHoverOrder>Hover order</SupportsHoverOrder>
  </div>
);
