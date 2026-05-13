// Multiple inline keyframes in one animation shorthand should emit comma-separated animation-name.
import styled, { css } from "styled-components";

const PrimaryMoveAnimation = css`
  @keyframes PrimaryMove {
    to {
      transform: translateX(-18px);
    }
  }
`;

const SecondaryMoveAnimation = css`
  @keyframes SecondaryMove {
    to {
      transform: translateX(-10px);
    }
  }
`;

const AnimatedGroup = styled.g<{ isAnimated?: boolean }>`
  ${PrimaryMoveAnimation}
  ${SecondaryMoveAnimation}

  ${(props) =>
    props.isAnimated
      ? css`
          animation:
            PrimaryMove 1s ease-out forwards,
            SecondaryMove 1.4s ease-in-out forwards;
          animation-delay: 0s, 1s;
        `
      : css`
          transform: translateX(-10px);
        `}
`;

export function App() {
  return (
    <svg>
      <AnimatedGroup isAnimated>
        <circle cx="24" cy="24" r="12" />
      </AnimatedGroup>
    </svg>
  );
}
