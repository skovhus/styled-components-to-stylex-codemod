import"./chunk-zsgVPwQN.js";import{t as e}from"./react-D4cBbUL-.js";import{f as t,l as n,s as r}from"./index-BmVIem5v.js";e();var i=t(),a=n`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`,o=r.span`
  animation: ${a} ease-out ${e=>e.$fadeInDuration??200}ms;
`;function s(){return(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,i.jsx)(o,{children:`Default (200ms)`}),(0,i.jsx)(o,{$fadeInDuration:500,children:`Custom (500ms)`})]})}export{s as App};