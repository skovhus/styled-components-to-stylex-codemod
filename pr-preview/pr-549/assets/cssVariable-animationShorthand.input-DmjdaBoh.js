import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{c as t,u as n}from"./index-Bu3pgbYO.js";var r=e(),i=t`
  0% { opacity: 0.4; }
  50% { opacity: 1; }
  100% { opacity: 0.4; }
`,a=t`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
`,o=n.div`
  position: relative;
  height: 8px;
  background-color: cornflowerblue;
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    opacity: var(--animation-enabled, 0);
    animation: ${i} var(--animation-duration, 1.5s) infinite;
    animation-timing-function: ease-in-out;
  }
`,s=n.div`
  width: 40px;
  height: 40px;
  background-color: tomato;
  animation: ${a} 2s var(--easing, ease-in-out) infinite;
`,c=n.div`
  width: 40px;
  height: 40px;
  background-color: gold;
  animation: ${a} var(--dur, 0.8s) var(--delay, 0.2s) ease-out infinite;
`,l=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,r.jsx)(o,{children:`Progress`}),(0,r.jsx)(s,{children:`Pulse`}),(0,r.jsx)(c,{children:`Delay`})]});export{l as App};