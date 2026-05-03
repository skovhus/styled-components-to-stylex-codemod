import{f as e,l as t,s as n}from"./index-BZzx-Jen.js";var r=e(),i=40,a=1.8,o=t`
  from {
    transform: translateX(-${i}px);
  }
  to {
    transform: translateX(100%);
  }
`,s=n.div`
  display: inline-block;
  animation: ${o} ${a}s linear infinite;
  background-color: #eef2ff;
  border: 1px solid #818cf8;
  padding: 8px 12px;
`,c=()=>(0,r.jsx)(s,{children:`Animated sweep`});export{c as App};