import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t}from"./index-6jK2wyqT.js";import{h as n}from"./helpers-Dfp-of_T.js";import{t as r}from"./TouchDeviceToggle-Dz9zjlAQ.js";var i=e(),a=t.button`
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