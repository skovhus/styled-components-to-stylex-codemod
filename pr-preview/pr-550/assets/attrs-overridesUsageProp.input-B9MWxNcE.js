import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-DMPMVQTD.js";var n=e(),r=t.div.attrs({color:`crimson`})`
  background-color: ${e=>e.color};
  color: white;
  padding: 16px 24px;
  border-radius: 4px;
  font-weight: 600;
`,i=t.div.attrs({className:`static-class`})`
  color: ${e=>e.className};
  background-color: #f6f6f6;
  padding: 16px 24px;
  border: 2px solid #222;
  border-radius: 4px;
`,a=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:8,padding:16},children:[(0,n.jsx)(r,{color:`dodgerblue`,children:`attrs wins (crimson)`}),(0,n.jsx)(r,{children:`attrs default (crimson)`}),(0,n.jsx)(i,{className:`external-class`,children:`className stays dynamic`}),(0,n.jsx)(i,{children:`static className still merges`})]});export{a as App};