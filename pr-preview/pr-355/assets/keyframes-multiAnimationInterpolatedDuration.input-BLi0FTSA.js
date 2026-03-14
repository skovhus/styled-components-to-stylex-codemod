import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,l as r,s as i}from"./index-BEHMEpNn.js";e(t(),1);var a=n(),o=r`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`,s=r`
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
`,c=i.div`
  animation: ${o} ${e=>e.$duration??200}ms ease, ${s} ${e=>e.$duration??1e3}ms linear;
  padding: 20px;
  background: white;
`;function l(){return(0,a.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,a.jsx)(c,{children:`Default (200ms, 1000ms)`}),(0,a.jsx)(c,{$duration:500,children:`Custom (500ms, 500ms)`})]})}export{l as App};