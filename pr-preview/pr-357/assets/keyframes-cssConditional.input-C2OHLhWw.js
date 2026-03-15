import"./react-D4cBbUL-.js";import{f as e,l as t,s as n,u as r}from"./index-CyUUxAP6.js";var i=e(),a=t`
  0% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }

  100% {
    opacity: 1;
  }
`,o=n.div`
  background-color: cornflowerblue;
  padding: 24px;
  color: white;
  ${e=>e.$isAnimating&&r`
      animation: ${a} 1.6s ease-in-out infinite;
    `}
`,s=n.span`
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: tomato;
  ${e=>e.$active&&r`
      animation-name: ${a};
      animation-duration: 2s;
      animation-iteration-count: infinite;
    `}
`,c=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16,alignItems:`center`},children:[(0,i.jsx)(o,{$isAnimating:!0,children:`Animating`}),(0,i.jsx)(o,{children:`Static`}),(0,i.jsx)(s,{$active:!0}),(0,i.jsx)(s,{})]});export{c as App};