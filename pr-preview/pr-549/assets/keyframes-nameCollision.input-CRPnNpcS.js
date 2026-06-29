import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,m as n,u as r}from"./index-DeOIcTPt.js";n();var i=e(),a=r.div`
  @keyframes Move {
    from {
      transform: translateX(-8px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  animation: Move 0.6s ease-out;
  background: #e0f2fe;
  border-radius: 8px;
  padding: 16px;
  color: #0369a1;
`,o=r.svg`
  @keyframes MoveIcon {
    from {
      transform: translateY(4px);
    }
    to {
      transform: translateY(0);
    }
  }

  width: 32px;
  height: 32px;
  fill: #4f46e5;

  ${e=>e.$animated?t`
          animation: MoveIcon 0.8s ease-out forwards;
        `:void 0}
`;function s(){return(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:20},children:[(0,i.jsx)(a,{children:`Moving in`}),(0,i.jsx)(o,{$animated:!0,viewBox:`0 0 32 32`,children:(0,i.jsx)(`circle`,{cx:`16`,cy:`16`,r:`12`})})]})}export{s as App,a as Move,o as MoveIcon};