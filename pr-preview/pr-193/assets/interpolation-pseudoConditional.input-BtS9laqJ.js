import{j as o,a as t}from"./index-BDzX_pJA.js";import{k as r}from"./helpers-DY92gZGo.js";import{T as i}from"./TouchDeviceToggle-BdKNADOf.js";const p=t.button`
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
