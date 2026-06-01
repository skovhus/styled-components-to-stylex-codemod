import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t}from"./index-BVHlTX5E.js";import{h as n}from"./helpers-B7OCVyu0.js";import{t as r}from"./TouchDeviceToggle-BocGw_nN.js";var i=e(),a=t.button`
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