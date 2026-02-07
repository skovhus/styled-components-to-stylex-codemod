import{j as t,d as i}from"./index-Cx_8Apnd.js";import{t as e}from"./helpers-DcBxhT8p.js";const r=i.p`
  font-size: 14px;
  width: 180px;
  padding: 8px 10px;
  border: 1px solid #cfd8dc;
  background-color: #f8f9fb;
  margin: 0;
  &:hover {
    ${o=>o.$truncate?e():""}
  }
`,s=()=>t.jsxs("div",{style:{display:"grid",gap:12,padding:12,border:"1px dashed #d1d5db",maxWidth:240},children:[t.jsxs("div",{children:[t.jsx("div",{style:{fontSize:12,color:"#6b7280",marginBottom:4},children:"Normal"}),t.jsx(r,{children:"Normal text that will wrap without truncation on hover"})]}),t.jsxs("div",{children:[t.jsx("div",{style:{fontSize:12,color:"#6b7280",marginBottom:4},children:"Truncate on hover"}),t.jsx(r,{$truncate:!0,children:"Long text that will truncate with ellipsis when you hover over this box"})]})]});export{s as App};
