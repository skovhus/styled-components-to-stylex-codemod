import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{i as t}from"./styled-components.browser.esm-Dy4oaG3m.js";import{h as n}from"./helpers-daleu_Aj.js";var r=e(),i=t.button`
  color: blue;
  padding: 8px 16px;

  &:${n} {
    ${e=>e.$active&&`background-color: red;`}
  }
`,a=t.button`
  color: blue;
  padding: 8px 16px;

  &:${n} {
    ${e=>e.$disabled?``:`background-color: green;`}
  }
`,o=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,gap:`16px`,padding:`16px`},children:[(0,r.jsx)(i,{$active:!0,children:`Active`}),(0,r.jsx)(i,{children:`Inactive`}),(0,r.jsx)(a,{children:`Enabled`}),(0,r.jsx)(a,{$disabled:!0,children:`Disabled`})]});export{o as App};