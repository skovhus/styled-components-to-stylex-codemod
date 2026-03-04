import{j as i,s,c as o,p as a}from"./index-LOHGFLq1.js";const c=a`
  0% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }

  100% {
    opacity: 1;
  }
`,t=o.div`
  background-color: cornflowerblue;
  padding: 24px;
  color: white;
  ${n=>n.$isAnimating&&s`
      animation: ${c} 1.6s ease-in-out infinite;
    `}
`,e=()=>i.jsxs("div",{style:{display:"flex",gap:16,padding:16},children:[i.jsx(t,{$isAnimating:!0,children:"Animating"}),i.jsx(t,{children:"Static"})]});export{e as App};
