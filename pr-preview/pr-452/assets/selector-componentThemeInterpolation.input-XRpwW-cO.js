import{c as e,p as t}from"./index-Cp4ZDml8.js";var n=t(),r=e.a`
  display: flex;
  align-items: center;
  padding: 5px 10px;
  background: papayawhip;
  color: #bf4f74;
`,i=e.span`
  padding: 4px 8px;
  background: ${e=>e.theme.color.bgSub};

  ${r}:focus-visible & {
    outline: 2px solid ${e=>e.theme.color.labelBase};
  }
`,a=()=>(0,n.jsxs)(r,{href:`#`,children:[(0,n.jsx)(i,{children:`Label`}),`Hover me`]});export{a as App};