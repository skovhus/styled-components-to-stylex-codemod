import{j as o,c as t}from"./index-Cc9ANA2v.js";import{m as r}from"./helpers-Gm9elXLl.js";import{T as c}from"./TouchDeviceToggle-D3mQ01jG.js";const i=t.button`
  color: blue;
  padding: 8px 16px;

  &:${r} {
    color: red;
    background-color: yellow;
  }
`,p=t.button`
  color: green;
  padding: 8px 16px;

  &&:${r} {
    color: purple;
    background-color: orange;
  }
`,s=()=>o.jsx(c,{children:()=>o.jsxs("div",{style:{display:"flex",gap:"16px",padding:"16px"},children:[o.jsx(i,{children:"Highlight Button"}),o.jsx(p,{children:"Specific Button"})]})});export{s as App};
