import{j as o,c as t}from"./index-tADOZih9.js";import{l as r}from"./helpers-B72owbyU.js";import{T as c}from"./TouchDeviceToggle-D6TVGvm0.js";const i=t.button`
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
