// Attribute fallbacks outside @supports must not be dropped or replaced by guarded enhanced values.
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

export const App = () => (
  <CollapsibleRegion data-open="true">
    <div>Open content</div>
  </CollapsibleRegion>
);
