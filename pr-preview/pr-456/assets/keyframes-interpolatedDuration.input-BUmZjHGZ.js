import"./chunk-jRWAZmH_.js";import{c as e,m as t,p as n,u as r}from"./index-CAZQsAq0.js";t();var i=n(),a=r`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`,o=e.span`
  animation: ${a} ease-out ${e=>e.$fadeInDuration??200}ms;
`;function s(){return(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,i.jsx)(o,{children:`Default (200ms)`}),(0,i.jsx)(o,{$fadeInDuration:500,children:`Custom (500ms)`})]})}export{s as App};