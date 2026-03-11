import{j as e,c as i}from"./index-9twgB538.js";import{p as o}from"./helpers-D9jvaHsS.js";const t=i.div`
  line-height: 1rem;
  ${({$oneLine:n})=>o(n?1:2)};
`,s=()=>e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"8px",padding:"16px"},children:[e.jsx(t,{$oneLine:!0,children:"One line truncated"}),e.jsx(t,{$oneLine:!1,children:"Two line truncated text that should wrap to a second line before being cut off"})]});export{s as App};
