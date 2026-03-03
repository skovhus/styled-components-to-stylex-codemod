import{j as t,c as n,p as i}from"./index-DJDPyVd0.js";const o=i`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`,a=n.span`
  animation: ${o} ${s=>s.$duration??200}ms 0.5s ease-out;
`;function d(){return t.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:16,padding:16},children:[t.jsx(a,{children:"Default duration (200ms), delay (0.5s)"}),t.jsx(a,{$duration:800,children:"Custom duration (800ms), delay (0.5s)"})]})}export{d as App};
