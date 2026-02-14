import{j as o,a}from"./index-wW1ous6h.js";const r=a.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`,n=a.span`
  padding: 4px 8px;
  color: gray;

  &:focus {
    color: orange;
  }

  ${r}:hover & {
    color: blue;
  }
`,e=()=>o.jsx(r,{href:"#",children:o.jsx(n,{children:"Label (gray, orange on focus, blue on Link hover)"})});export{e as App};
