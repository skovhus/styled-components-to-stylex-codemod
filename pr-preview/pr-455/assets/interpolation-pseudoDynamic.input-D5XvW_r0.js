import{c as e,p as t}from"./index-BUiihUH8.js";import{m as n}from"./helpers-Cyj_3Q85.js";var r=t(),i=e.button`
  color: blue;
  padding: 8px 16px;

  &:${n} {
    ${e=>e.$active&&`background-color: red;`}
  }
`,a=e.button`
  color: blue;
  padding: 8px 16px;

  &:${n} {
    ${e=>e.$disabled?``:`background-color: green;`}
  }
`,o=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,gap:`16px`,padding:`16px`},children:[(0,r.jsx)(i,{$active:!0,children:`Active`}),(0,r.jsx)(i,{children:`Inactive`}),(0,r.jsx)(a,{children:`Enabled`}),(0,r.jsx)(a,{$disabled:!0,children:`Disabled`})]});export{o as App};