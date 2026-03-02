import{j as e,c as t}from"./index-ByxdD1MA.js";import{b as d,j as i}from"./helpers-Ch_q81-w.js";const r=t.div`
  padding: 8px;
  border: ${o=>o.position==="top"?d("labelMuted")(o):"none"};
  border-bottom: ${o=>i(o.theme.color.bgSub)};
`,s=t.div`
  border: ${d("labelMuted")};
`,p=()=>e.jsxs("div",{style:{margin:"10px",padding:"10px",height:"100px"},children:[e.jsx(r,{position:"top",children:"Top box with themed border"}),e.jsx(r,{position:"bottom",children:"Bottom box without border"}),e.jsx(s,{children:"Bordered box"})]});export{p as App};
