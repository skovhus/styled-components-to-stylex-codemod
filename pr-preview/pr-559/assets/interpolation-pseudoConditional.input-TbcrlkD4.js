import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{i as t}from"./styled-components.browser.esm-Dy4oaG3m.js";import{h as n}from"./helpers-daleu_Aj.js";import{t as r}from"./TouchDeviceToggle-C6TiR8qI.js";var i=e(),a=t.button`
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