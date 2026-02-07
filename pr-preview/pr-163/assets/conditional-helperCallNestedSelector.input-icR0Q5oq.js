import{j as t,d as e}from"./index-DMuxzsKV.js";import{t as i}from"./helpers-Dr9nLsm7.js";const o=e.p`
  font-size: 14px;
  width: 180px;
  padding: 8px 10px;
  border: 1px solid #cfd8dc;
  background-color: #f8f9fb;
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  margin: 0;
  &:hover {
    ${r=>r.$truncate?i():""}
  }
`,s=()=>t.jsxs("div",{style:{display:"grid",gap:12,padding:12,border:"1px dashed #d1d5db",maxWidth:240},children:[t.jsxs("div",{children:[t.jsx("div",{style:{fontSize:12,color:"#6b7280",marginBottom:4},children:"Normal"}),t.jsx(o,{children:"Normal text that will wrap without truncation on hover"})]}),t.jsxs("div",{children:[t.jsx("div",{style:{fontSize:12,color:"#6b7280",marginBottom:4},children:"Truncate on hover"}),t.jsx(o,{$truncate:!0,children:"Long text that will truncate with ellipsis when you hover over this box"})]})]});export{s as App};
