import{c as e,d as t,p as n,u as r}from"./index-DwfImnim.js";var i=n(),a=r`
  0% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }

  100% {
    opacity: 1;
  }
`,o=e.div`
  background-color: cornflowerblue;
  padding: 24px;
  color: white;
  ${e=>e.$isAnimating&&t`
      animation: ${a} 1.6s ease-in-out infinite;
    `}
`,s=e.span`
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: tomato;
  ${e=>e.$active&&t`
      animation-name: ${a};
      animation-duration: 2s;
      animation-iteration-count: infinite;
    `}
`,c=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16,alignItems:`center`},children:[(0,i.jsx)(o,{$isAnimating:!0,children:`Animating`}),(0,i.jsx)(o,{children:`Static`}),(0,i.jsx)(s,{$active:!0}),(0,i.jsx)(s,{})]});export{c as App};