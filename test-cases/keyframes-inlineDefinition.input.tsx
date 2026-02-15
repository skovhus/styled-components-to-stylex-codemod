import styled from "styled-components";

const FadeIn = styled.div`
  @keyframes fadeIn {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }
  animation: fadeIn 0.2s ease both;
  background: lightcoral;
  padding: 20px;
`;

const SlideUp = styled.div`
  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  animation: slideUp 0.3s ease-out;
  background: lightblue;
  padding: 20px;
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20 }}>
      <FadeIn>Fading In</FadeIn>
      <SlideUp>Sliding Up</SlideUp>
    </div>
  );
}
