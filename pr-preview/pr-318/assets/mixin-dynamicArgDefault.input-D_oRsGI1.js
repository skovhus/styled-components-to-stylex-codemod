import{j as i,c as n}from"./index-DNMXq8FX.js";import{p as o}from"./helpers-BNE-wUHV.js";const l=n.div`
  line-height: 1rem;
  ${({$oneLine:e=!0})=>o(e?1:2)};
`,t=n.div`
  line-height: 1rem;
  ${({$oneLine:e=!0})=>o(e?1:2)};
  color: ${({$oneLine:e})=>e===void 0?"purple":"teal"};
`,a=()=>i.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"8px",padding:"16px"},children:[i.jsx(l,{children:"Default one-line (safe to hoist default)"}),i.jsx(l,{$oneLine:!1,children:"Two-line truncated"}),i.jsx(t,{children:"Default one-line and purple"}),i.jsx(t,{$oneLine:!1,children:"Two-line and teal"})]});export{a as App};
