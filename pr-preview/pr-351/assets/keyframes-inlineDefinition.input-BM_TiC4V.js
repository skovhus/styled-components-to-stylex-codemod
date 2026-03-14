import{j as a,c as s,s as i}from"./index-DLlxaOnC.js";const t=s.div`
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
`,o=s.div`
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
`,r=s.div`
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
`,d=i`
  @keyframes Dash {
    to {
      stroke-dashoffset: 0;
    }
  }
`,n=s.path`
  ${d}
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  ${e=>e.$isAnimated&&i`
      animation: Dash 1s ease-out forwards;
    `}
`;function p(){return a.jsxs("div",{style:{display:"flex",gap:16,padding:20},children:[a.jsx(t,{children:"Fading In"}),a.jsx(o,{children:"Sliding Up"}),a.jsx(r,{children:"Bouncing In"}),a.jsxs("svg",{children:[a.jsx(n,{$isAnimated:!0,d:"M10,80 Q95,10 180,80"}),a.jsx(n,{d:"M10,80 Q95,10 180,80"})]})]})}export{p as App};
