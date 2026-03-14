import{j as e,c as i}from"./index-pra5AE2-.js";import{o as n}from"./helpers-CkaP9_mF.js";const o=i.button`
  color: blue;
  padding: 8px 16px;

  &:${n} {
    ${t=>t.$active&&"background-color: red;"}
  }
`,d=i.button`
  color: blue;
  padding: 8px 16px;

  &:${n} {
    ${t=>t.$disabled?"":"background-color: green;"}
  }
`,l=()=>e.jsxs("div",{style:{display:"flex",gap:"16px",padding:"16px"},children:[e.jsx(o,{$active:!0,children:"Active"}),e.jsx(o,{children:"Inactive"}),e.jsx(d,{children:"Enabled"}),e.jsx(d,{$disabled:!0,children:"Disabled"})]});export{l as App};
