import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,l as r,s as i}from"./index-DVlcDaUT.js";e(t(),1);var a=n(),o=r`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`,s=i.span`
  animation: ${o} ${e=>e.$duration??200}ms 0.5s ease-out;
`;function c(){return(0,a.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,a.jsx)(s,{children:`Default duration (200ms), delay (0.5s)`}),(0,a.jsx)(s,{$duration:800,children:`Custom duration (800ms), delay (0.5s)`})]})}export{c as App};