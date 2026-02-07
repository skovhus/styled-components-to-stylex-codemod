import{j as e,d as t}from"./index-DMuxzsKV.js";import{b as d,k as i}from"./helpers-Dr9nLsm7.js";const r=t.div`
  padding: 8px;
  border: ${o=>o.position==="top"?d("labelMuted")(o):"none"};
  border-bottom: ${o=>i(o.theme.color.bgSub)};
`,s=t.div`
  border: ${d("labelMuted")};
`,p=()=>e.jsxs("div",{style:{margin:"10px",padding:"10px",height:"100px"},children:[e.jsx(r,{position:"top",children:"Top box with themed border"}),e.jsx(r,{position:"bottom",children:"Bottom box without border"}),e.jsx(s,{children:"Bordered box"})]});export{p as App};
