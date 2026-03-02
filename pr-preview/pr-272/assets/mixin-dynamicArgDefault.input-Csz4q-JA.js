import{j as i,c as n}from"./index-sBfjkZxR.js";import{n as o}from"./helpers-Bpzo31y8.js";const l=n.div`
  line-height: 1rem;
  ${({$oneLine:e=!0})=>o(e?1:2)};
`,t=n.div`
  line-height: 1rem;
  ${({$oneLine:e=!0})=>o(e?1:2)};
  color: ${({$oneLine:e})=>e===void 0?"purple":"teal"};
`,a=()=>i.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"8px",padding:"16px"},children:[i.jsx(l,{children:"Default one-line (safe to hoist default)"}),i.jsx(l,{$oneLine:!1,children:"Two-line truncated"}),i.jsx(t,{children:"Default one-line and purple"}),i.jsx(t,{$oneLine:!1,children:"Two-line and teal"})]});export{a as App};
