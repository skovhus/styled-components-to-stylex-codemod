import styled from "styled-components";

// Static animation-name longhand referencing inline @keyframes
const ZoomIn = styled.div`
  @keyframes zoomIn {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
  animation-name: zoomIn;
  animation-duration: 0.3s;
  animation-timing-function: ease-out;
  animation-fill-mode: both;
  background-color: lightsalmon;
  padding: 20px;
`;

// Kebab-case keyframe name
const SlideDown = styled.div`
  @keyframes slide-down {
    from {
      transform: translateY(-20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  animation-name: slide-down;
  animation-duration: 0.4s;
  animation-timing-function: ease-in-out;
  background-color: lightsteelblue;
  padding: 20px;
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20 }}>
      <ZoomIn>Zoom In</ZoomIn>
      <SlideDown>Slide Down</SlideDown>
    </div>
  );
}
