import"./chunk-jRWAZmH_.js";import{c as e,m as t,p as n}from"./index-DTT2cnJb.js";t();var r=n(),i=e.div`
  background: ${e=>e.$direction===`horizontal`?`linear-gradient(90deg, #bf4f74, #3498db)`:`linear-gradient(180deg, #bf4f74, #3498db)`};
  padding: 24px;
`,a=e.div`
  padding: 12px 16px;
  border-bottom: ${e=>e.$isActive?`2px solid #bf4f74`:`2px solid transparent`};
  cursor: pointer;
`,o=e.div`
  position: absolute;
  left: 10px;
  bottom: ${e=>e.$large?80:20}px;
  padding: 12px 16px;
  background-color: paleturquoise;
  border: 2px solid teal;
`,s=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(i,{$direction:`horizontal`,children:`Horizontal Gradient`}),(0,r.jsx)(a,{$isActive:!0,children:`Active Tab`}),(0,r.jsx)(a,{children:`Inactive Tab`}),(0,r.jsxs)(`div`,{style:{position:`relative`,height:`200px`},children:[(0,r.jsx)(o,{$large:!0,children:`Large Box (bottom: 80px)`}),(0,r.jsx)(o,{style:{left:200},children:`Small Box (bottom: 20px)`})]})]});export{s as App};