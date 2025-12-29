import styled from "styled-components";

const Icon = styled.span`
  display: inline-block;
  width: 16px;
  height: 16px;
  background: currentColor;
  mask-size: contain;
`;

const Button = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #BF4F74;
  color: white;
  border: none;
  border-radius: 4px;

  ${Icon} {
    width: 20px;
    height: 20px;
    opacity: 0.8;
  }

  &:hover ${Icon} {
    opacity: 1;
    transform: scale(1.1);
  }
`;

export const App = () => (
  <div>
    <Button>
      <Icon />
      Click me
    </Button>
  </div>
);
