// expected-warnings: vendor-prefixed-property
import styled from "styled-components";

const ScrollableList = styled.div`
  width: 100%;
  height: 200px;
  overflow-y: auto;
`;

const CustomInput = styled.input`
  padding: 8px;
  border: 1px solid gray;
  border-radius: 4px;
  outline: none;

  &:focus {
    border-color: blue;
  }

  &:disabled {
    border-color: transparent;
  }
`;

const ScrollMarginBox = styled.div`
  padding: 16px;
  scroll-margin: 12px;
  scroll-margin-top: 24px;
`;

const RangeSlider = styled.input`
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 8px;
  background: #ddd;
  border-radius: 4px;
`;

export const App = () => (
  <div>
    <ScrollableList>
      <p>Item 1</p>
      <p>Item 2</p>
      <p>Item 3</p>
    </ScrollableList>
    <CustomInput placeholder="Type here..." />
    <ScrollMarginBox>Scroll margin content</ScrollMarginBox>
    <RangeSlider type="range" min="0" max="100" />
  </div>
);
