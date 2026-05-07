import{c as e,p as t}from"./index-pB-WyW-a.js";import{h as n}from"./helpers-F-qFSGrg.js";import{t as r}from"./TouchDeviceToggle-DQ8Cn93g.js";var i=t(),a=e.button`
  color: blue;
  padding: 8px 16px;

  &:${n} {
    color: red;
    background-color: yellow;
  }
`,o=e.button`
  color: green;
  padding: 8px 16px;

  &&:${n} {
    color: purple;
    background-color: orange;
  }
`,s=()=>(0,i.jsx)(r,{children:()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:`16px`,padding:`16px`},children:[(0,i.jsx)(a,{children:`Highlight Button`}),(0,i.jsx)(o,{children:`Specific Button`})]})});export{s as App};