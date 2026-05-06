import"./chunk-jRWAZmH_.js";import{c as e,m as t,p as n,u as r}from"./index-DDUSP3M2.js";t();var i=n(),a=r`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`,o=e.span`
  animation: ${a} ${e=>e.$duration??200}ms 0.5s ease-out;
`;function s(){return(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,i.jsx)(o,{children:`Default duration (200ms), delay (0.5s)`}),(0,i.jsx)(o,{$duration:800,children:`Custom duration (800ms), delay (0.5s)`})]})}export{s as App};