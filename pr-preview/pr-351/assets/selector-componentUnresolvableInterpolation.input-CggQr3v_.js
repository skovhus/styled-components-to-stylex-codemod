import{j as e,c as p}from"./index-MdT_9Pu7.js";const a=p.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`,i=p.span`
  padding: 4px 8px;

  ${a}:hover & {
    color: ${n=>n.$active?"green":"gray"};
  }
`,s=()=>e.jsxs("div",{style:{display:"flex",gap:16,padding:16},children:[e.jsx(a,{href:"#",children:e.jsx(i,{$active:!0,children:"Active"})}),e.jsx(a,{href:"#",children:e.jsx(i,{children:"Inactive"})})]});export{s as App};
