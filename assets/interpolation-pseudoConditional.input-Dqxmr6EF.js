import{j as o,a as t}from"./index-DzCoX6nJ.js";import{j as r}from"./helpers-BeUNdjPk.js";import{T as i}from"./TouchDeviceToggle-B6JqGkPH.js";const p=t.button`
  color: blue;
  padding: 8px 16px;

  &:${r} {
    color: red;
    background-color: yellow;
  }
`,c=t.button`
  color: green;
  padding: 8px 16px;

  &&:${r} {
    color: purple;
    background-color: orange;
  }
`,s=()=>o.jsx(i,{children:()=>o.jsxs("div",{style:{display:"flex",gap:"16px",padding:"16px"},children:[o.jsx(p,{children:"Highlight Button"}),o.jsx(c,{children:"Specific Button"})]})});export{s as App};
