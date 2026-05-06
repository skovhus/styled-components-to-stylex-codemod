import{c as e,p as t}from"./index-A-doGjCS.js";var n=t(),r=e.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`,i=e.span`
  padding: 4px 8px;
  color: gray;

  ${r}:focus-visible &, ${r}:active & {
    color: blue;
  }
`,a=()=>(0,n.jsx)(r,{href:`#`,children:(0,n.jsx)(i,{children:`Badge (blue on focus-visible OR active)`})});export{a as App};