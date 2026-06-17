import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,u as n}from"./index-CHNyLHKO.js";var r=e(),i=n.div`
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
`,a=n.div`
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
`,o=n.div`
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
`,s=t`
  @keyframes Dash {
    to {
      stroke-dashoffset: 0;
    }
  }
`,c=n.path`
  ${s}
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  ${e=>e.$isAnimated&&t`
      animation: Dash 1s ease-out forwards;
    `}
`,l=n.path`
  ${s}
  ${e=>e.isAnimated&&t`
      animation: Dash 1.5s ease-out forwards;
    `}
`;function u(){return(0,r.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:20},children:[(0,r.jsx)(i,{children:`Fading In`}),(0,r.jsx)(a,{children:`Sliding Up`}),(0,r.jsx)(o,{children:`Bouncing In`}),(0,r.jsxs)(`svg`,{children:[(0,r.jsx)(c,{$isAnimated:!0,d:`M10,80 Q95,10 180,80`}),(0,r.jsx)(c,{d:`M10,80 Q95,10 180,80`}),(0,r.jsx)(l,{isAnimated:!0,d:`M20,90 Q105,20 190,90`})]})]})}export{u as App};