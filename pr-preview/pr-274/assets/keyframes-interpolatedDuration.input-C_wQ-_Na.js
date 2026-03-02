import{j as n,c as s,p as o}from"./index-BkPtFZ51.js";const e=o`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`,t=s.span`
  animation: ${e} ease-out ${a=>a.$fadeInDuration??200}ms;
`;function p(){return n.jsxs("div",{style:{display:"flex",gap:16,padding:16},children:[n.jsx(t,{children:"Default (200ms)"}),n.jsx(t,{$fadeInDuration:500,children:"Custom (500ms)"})]})}export{p as App};
