import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-Ey6_vfJ_.js";import{h as n}from"./helpers-Bx_LxvB1.js";import{t as r}from"./TouchDeviceToggle-BhrySV7E.js";var i=e(),a=t.button`
  color: blue;
  padding: 8px 16px;

  &:${n} {
    color: red;
    background-color: yellow;
  }
`,o=t.button`
  color: green;
  padding: 8px 16px;

  &&:${n} {
    color: purple;
    background-color: orange;
  }
`,s=()=>(0,i.jsx)(r,{children:()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:`16px`,padding:`16px`},children:[(0,i.jsx)(a,{children:`Highlight Button`}),(0,i.jsx)(o,{children:`Specific Button`})]})});export{s as App};