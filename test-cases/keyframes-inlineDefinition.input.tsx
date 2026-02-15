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

const BounceIn = styled.div`
  @keyframes bounce-in {
    0% {
      transform: scale(0.5);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
  animation: bounce-in 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55);
  background: lightgreen;
  padding: 20px;
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20 }}>
      <FadeIn>Fading In</FadeIn>
      <SlideUp>Sliding Up</SlideUp>
      <BounceIn>Bouncing In</BounceIn>
    </div>
  );
}
