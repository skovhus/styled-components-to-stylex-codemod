import{j as e,c as o}from"./index-DExQN3F7.js";import{n as i}from"./helpers-CiZZ6Azq.js";const d=o.button`
  color: blue;
  padding: 8px 16px;

  &:${i} {
    ${t=>t.$active&&"background-color: red;"}
  }
`,n=o.button`
  color: blue;
  padding: 8px 16px;

  &:${i} {
    ${t=>t.$disabled?"":"background-color: green;"}
  }
`,l=()=>e.jsxs("div",{style:{display:"flex",gap:"16px",padding:"16px"},children:[e.jsx(d,{$active:!0,children:"Active"}),e.jsx(d,{children:"Inactive"}),e.jsx(n,{children:"Enabled"}),e.jsx(n,{$disabled:!0,children:"Disabled"})]});export{l as App};
