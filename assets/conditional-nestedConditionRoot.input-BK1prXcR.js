import{j as e,c as s}from"./index-BZdvn_zz.js";const d=s.div`
  position: relative;
  width: 100px;
  height: 60px;
  background: #ddd;
  color: #222;
  ${i=>i.$layer?.isTop?`z-index: ${i.$zIndex};`:""}
`,a=()=>e.jsxs("div",{style:{display:"flex",gap:8,padding:8},children:[e.jsx(d,{$layer:{isTop:!0},$zIndex:"3",children:"Top layer"}),e.jsx(d,{$layer:{isTop:!1},$zIndex:"1",children:"Base layer"})]});export{a as App};
