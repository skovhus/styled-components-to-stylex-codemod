import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t}from"./index-D7SGfj3i.js";import{h as n}from"./helpers-CTVMGiCI.js";import{t as r}from"./TouchDeviceToggle-BkIy08bX.js";var i=e(),a=t.button`
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