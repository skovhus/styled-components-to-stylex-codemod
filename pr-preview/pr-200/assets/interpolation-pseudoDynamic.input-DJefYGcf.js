import{j as e,a as i}from"./index-DkVrfvNx.js";import{j as n}from"./helpers-BqYn1KRI.js";const d=i.button`
  color: blue;
  padding: 8px 16px;

  &:${n} {
    ${t=>t.$active&&"background-color: red;"}
  }
`,o=i.button`
  color: blue;
  padding: 8px 16px;

  &:${n} {
    ${t=>t.$disabled?"":"background-color: green;"}
  }
`,l=()=>e.jsxs("div",{style:{display:"flex",gap:"16px",padding:"16px"},children:[e.jsx(d,{$active:!0,children:"Active"}),e.jsx(d,{children:"Inactive"}),e.jsx(o,{children:"Enabled"}),e.jsx(o,{$disabled:!0,children:"Disabled"})]});export{l as App};
