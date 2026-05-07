import{c as e,d as t,p as n}from"./index-JUItjMPr.js";var r=n(),i=e.div`
  width: 80px;
  height: 40px;
  border: 1px solid #94a3b8;
  background-color: ${e=>e.$background||`transparent`};

  ${e=>e.$active&&t`
      &:hover {
        background-color: ${e.theme.color.bgBorderSolid};
      }
    `}
`,a=()=>(0,r.jsx)(`div`,{style:{display:`flex`,gap:8,padding:16},children:(0,r.jsx)(i,{})});export{a as App};