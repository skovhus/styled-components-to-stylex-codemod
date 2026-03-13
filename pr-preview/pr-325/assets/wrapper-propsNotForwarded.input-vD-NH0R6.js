import{j as e,c as h}from"./index-M0yL6_Af.js";function r({selected:d,highlighted:t,children:i,...l}){return e.jsxs("div",{...l,children:[d&&e.jsx("span",{children:"★"}),e.jsx("span",{style:{opacity:t?.7:1},children:i})]})}const s=h(r)`
  padding: 8px 12px;
  border-radius: 4px;
  background: #f0f0f0;
  ${d=>d.highlighted?"transform: scale(0.9);":""}
`,a=()=>e.jsxs("div",{style:{display:"flex",gap:16,padding:16},children:[e.jsx(s,{children:"Default"}),e.jsx(s,{selected:!0,children:"Selected (should show ★)"}),e.jsx(s,{highlighted:!0,children:"Highlighted (should be 0.7 opacity + scaled)"}),e.jsx(s,{highlighted:!0,selected:!0,children:"Both (should show ★ + 0.7 opacity + scaled)"})]});export{a as App};
