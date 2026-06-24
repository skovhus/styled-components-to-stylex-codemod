import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-CU8qmYyO.js";t();var r=e(),i=n.input`
  font-size: 14px;
  border: 1px solid #ccc;
  padding: 4px 8px;
`,a=({hasRange:e})=>(0,r.jsx)(i,{style:{width:e?48:`100%`,cursor:e?`text`:`ew-resize`,textAlign:e?`right`:`left`},defaultValue:e?`hasRange`:`no range`}),o=n.div`
  padding: 8px;
`,s=()=>!0,c=()=>(0,r.jsx)(o,{style:{width:s()?48:96,color:s()?`red`:`blue`},children:`call`}),l=n.div`
  padding: 4px;
`,u=n.div`
  background: yellow;
`,d=({active:e})=>(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(l,{style:{width:e?40:80,height:e?40:20},children:`box`}),(0,r.jsx)(u,{children:`active marker`})]}),f=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,gap:8,padding:16},children:[(0,r.jsx)(a,{hasRange:!0}),(0,r.jsx)(a,{hasRange:!1}),(0,r.jsx)(c,{}),(0,r.jsx)(d,{active:!0})]});export{f as App};