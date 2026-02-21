import{j as l,c as n}from"./index-FP_Cx-M0.js";import{l as o}from"./helpers-BIUw4OQN.js";const i=n.div`
  line-height: 1rem;
  ${({$oneLine:e=!0})=>o(e?1:2)};
`,t=n.div`
  line-height: 1rem;
  ${({$oneLine:e=!0})=>o(e?1:2)};
  color: ${({$oneLine:e})=>e===void 0?"purple":"teal"};
`,a=()=>l.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"8px",padding:"16px"},children:[l.jsx(i,{children:"Default one-line (safe to hoist default)"}),l.jsx(i,{$oneLine:!1,children:"Two-line truncated"}),l.jsx(t,{children:"Default one-line and purple"}),l.jsx(t,{$oneLine:!1,children:"Two-line and teal"})]});export{a as App};
