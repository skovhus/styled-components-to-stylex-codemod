import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{c as t,m as n,u as r}from"./index-DRPegeCN.js";n();var i=e(),a=t`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`,o=t`
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
`,s=r.div`
  animation: ${a} ${e=>e.$duration??200}ms ease, ${o} ${e=>e.$duration??1e3}ms linear;
  padding: 20px;
  background: white;
`;function c(){return(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,i.jsx)(s,{children:`Default (200ms, 1000ms)`}),(0,i.jsx)(s,{$duration:500,children:`Custom (500ms, 500ms)`})]})}export{c as App};