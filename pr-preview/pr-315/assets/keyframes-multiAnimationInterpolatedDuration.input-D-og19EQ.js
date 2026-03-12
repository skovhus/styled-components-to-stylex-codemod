import{j as t,c as i,p as s}from"./index-Df4XxwGd.js";const o=s`
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
`,n=i.div`
  animation: ${o} ${a=>a.$duration??200}ms ease, ${r} 1s linear;
  padding: 20px;
  background: white;
`;function d(){return t.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:16,padding:16},children:[t.jsx(n,{children:"Default (200ms, 1s)"}),t.jsx(n,{$duration:500,children:"Custom (500ms, 1s)"})]})}export{d as App};
