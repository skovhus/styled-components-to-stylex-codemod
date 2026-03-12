import{j as i,s as o,c as s,p as c}from"./index-DxpPaJ3w.js";const e=c`
  0% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }

  100% {
    opacity: 1;
  }
`,n=s.div`
  background-color: cornflowerblue;
  padding: 24px;
  color: white;
  ${t=>t.$isAnimating&&o`
      animation: ${e} 1.6s ease-in-out infinite;
    `}
`,a=s.span`
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: tomato;
  ${t=>t.$active&&o`
      animation-name: ${e};
      animation-duration: 2s;
      animation-iteration-count: infinite;
    `}
`,p=()=>i.jsxs("div",{style:{display:"flex",gap:16,padding:16,alignItems:"center"},children:[i.jsx(n,{$isAnimating:!0,children:"Animating"}),i.jsx(n,{children:"Static"}),i.jsx(a,{$active:!0}),i.jsx(a,{})]});export{p as App};
