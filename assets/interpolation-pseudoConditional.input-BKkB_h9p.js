import{j as o,c as t}from"./index-DcvO7BsQ.js";import{n as r}from"./helpers-DHpCCrhY.js";import{T as c}from"./TouchDeviceToggle-Cn5aQkdB.js";const i=t.button`
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
