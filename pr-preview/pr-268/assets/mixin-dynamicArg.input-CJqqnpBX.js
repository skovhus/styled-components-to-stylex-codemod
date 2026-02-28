import{j as e,c as i}from"./index-DW2LM_o0.js";import{n as o}from"./helpers-B_VvAwei.js";const t=i.div`
  line-height: 1rem;
  ${({$oneLine:n})=>o(n?1:2)};
`,s=()=>e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"8px",padding:"16px"},children:[e.jsx(t,{$oneLine:!0,children:"One line truncated"}),e.jsx(t,{$oneLine:!1,children:"Two line truncated text that should wrap to a second line before being cut off"})]});export{s as App};
