import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-DRa1uduC.js";import{b as n}from"./helpers-CSf_JqIQ.js";var r=e(),i=t.div`
  padding: 8px;
  border: ${e=>e.$bordered?n(`blue`):`none`};
  width: 60px;
  height: 30px;
`,a=t.div`
  padding: 8px;
  border: ${e=>e.position===`free`?`none`:n(`transparent`)};
  ${e=>e.position===`top`?`border-bottom-width: 0; border-top-left-radius: 6px; border-top-right-radius: 6px;`:`border-top-width: 0; border-bottom-left-radius: 6px; border-bottom-right-radius: 6px;`}
  width: 60px;
  height: 30px;
`,o=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,gap:`10px`,padding:`10px`},children:[(0,r.jsx)(i,{$bordered:!0,children:`Bordered`}),(0,r.jsx)(i,{children:`Not Bordered`}),(0,r.jsx)(a,{position:`top`,children:`Top`}),(0,r.jsx)(a,{position:`bottom`,children:`Bottom`}),(0,r.jsx)(a,{position:`free`,children:`Free`})]});export{o as App};