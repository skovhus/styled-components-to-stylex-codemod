import{c as e,p as t}from"./index-Cp4ZDml8.js";var n=t(),r=e.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`,i=e.span`
  padding: 4px 8px;
  color: gray;

  &:focus {
    color: orange;
  }

  ${r}:hover & {
    color: blue;
  }
`,a=()=>(0,n.jsx)(r,{href:`#`,children:(0,n.jsx)(i,{children:`Label (gray, orange on focus, blue on Link hover)`})});export{a as App};