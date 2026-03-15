import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,l as r,s as i}from"./index-Dda2rlA_.js";e(t(),1);var a=n(),o=r`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`,s=i.span`
  animation: ${o} ease-out ${e=>e.$fadeInDuration??200}ms;
`;function c(){return(0,a.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,a.jsx)(s,{children:`Default (200ms)`}),(0,a.jsx)(s,{$fadeInDuration:500,children:`Custom (500ms)`})]})}export{c as App};