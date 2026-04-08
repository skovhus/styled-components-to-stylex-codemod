import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-BDfybiAC.js";import{b as n,i as r}from"./helpers-CF0SjAp-.js";var i=e(),a=t.div`
  padding: 8px;
  border: ${e=>e.position===`top`?n(`labelMuted`)(e):`none`};
  border-bottom: ${e=>r(e.theme.color.bgSub)};
`,o=t.div`
  border: ${n(`labelMuted`)};
`,s=()=>(0,i.jsxs)(`div`,{style:{margin:`10px`,padding:`10px`,height:`100px`},children:[(0,i.jsx)(a,{position:`top`,children:`Top box with themed border`}),(0,i.jsx)(a,{position:`bottom`,children:`Bottom box without border`}),(0,i.jsx)(o,{children:`Bordered box`})]});export{s as App};