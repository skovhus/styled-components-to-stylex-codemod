import{j as n,c as i,p as s}from"./index-B1AKZT7y.js";const o=s`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`,r=s`
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
`,a=i.div`
  animation: ${o} ${t=>t.$duration??200}ms ease, ${r} ${t=>t.$duration??1e3}ms linear;
  padding: 20px;
  background: white;
`;function d(){return n.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:16,padding:16},children:[n.jsx(a,{children:"Default (200ms, 1000ms)"}),n.jsx(a,{$duration:500,children:"Custom (500ms, 500ms)"})]})}export{d as App};
