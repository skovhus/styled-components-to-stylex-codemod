import{j as e,c as i}from"./index-Dva6ZfF5.js";import{n as o}from"./helpers-E-c4oiZK.js";const t=i.div`
  line-height: 1rem;
  ${({$oneLine:n})=>o(n?1:2)};
`,s=()=>e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"8px",padding:"16px"},children:[e.jsx(t,{$oneLine:!0,children:"One line truncated"}),e.jsx(t,{$oneLine:!1,children:"Two line truncated text that should wrap to a second line before being cut off"})]});export{s as App};
