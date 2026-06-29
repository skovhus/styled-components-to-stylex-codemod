import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-CDstLmN7.js";import{h as n}from"./helpers-AE5Qe1p4.js";import{t as r}from"./TouchDeviceToggle-BpfrIIK0.js";var i=e(),a=t.button`
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