import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-DxgGNx7w.js";var n=e(),r=t.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`,i=t.span`
  padding: 4px 8px;
  color: gray;

  &:focus {
    color: orange;
  }

  ${r}:hover & {
    color: blue;
  }
`,a=()=>(0,n.jsx)(r,{href:`#`,children:(0,n.jsx)(i,{children:`Label (gray, orange on focus, blue on Link hover)`})});export{a as App};