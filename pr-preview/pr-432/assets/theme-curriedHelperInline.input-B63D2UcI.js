import{c as e,p as t}from"./index-Bl-LV0k7.js";import{S as n,i as r}from"./helpers-CGoCSvSl.js";var i=t(),a=e.div`
  padding: 8px;
  border: ${e=>e.position===`top`?n(`labelMuted`)(e):`none`};
  border-bottom: ${e=>r(e.theme.color.bgSub)};
`,o=e.div`
  border: ${n(`labelMuted`)};
`,s=()=>(0,i.jsxs)(`div`,{style:{margin:`10px`,padding:`10px`,height:`100px`},children:[(0,i.jsx)(a,{position:`top`,children:`Top box with themed border`}),(0,i.jsx)(a,{position:`bottom`,children:`Bottom box without border`}),(0,i.jsx)(o,{children:`Bordered box`})]});export{s as App};