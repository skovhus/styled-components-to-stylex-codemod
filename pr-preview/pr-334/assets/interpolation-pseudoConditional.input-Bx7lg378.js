import{j as o,c as t}from"./index-DBKvU_Be.js";import{n as r}from"./helpers-BooIblR8.js";import{T as c}from"./TouchDeviceToggle-rHALiv9x.js";const i=t.button`
  color: blue;
  padding: 8px 16px;

  &:${r} {
    color: red;
    background-color: yellow;
  }
`,n=t.button`
  color: green;
  padding: 8px 16px;

  &&:${r} {
    color: purple;
    background-color: orange;
  }
`,s=()=>o.jsx(c,{children:()=>o.jsxs("div",{style:{display:"flex",gap:"16px",padding:"16px"},children:[o.jsx(i,{children:"Highlight Button"}),o.jsx(n,{children:"Specific Button"})]})});export{s as App};
