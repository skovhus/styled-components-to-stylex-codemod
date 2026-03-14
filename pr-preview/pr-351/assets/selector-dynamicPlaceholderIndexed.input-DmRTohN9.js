import{j as e,c as a}from"./index-DLlxaOnC.js";const l=a.input`
  padding: 12px;
  border: 1px solid #ccc;

  &::placeholder {
    color: ${o=>o.theme.color[o.$placeholderColor]};
  }
`,r=a.span`
  position: relative;
  padding: 4px 8px;
  background-color: #eee;

  &::after {
    content: "";
    display: block;
    height: 3px;
    background-color: ${o=>o.theme.color[o.$indicatorColor]};
  }
`,d=()=>e.jsxs("div",{style:{display:"grid",gap:12,padding:16},children:[e.jsx(l,{$placeholderColor:"labelBase",placeholder:"Base color"}),e.jsx(l,{$placeholderColor:"labelMuted",placeholder:"Muted color"}),e.jsx(r,{$indicatorColor:"labelBase",children:"Base"}),e.jsx(r,{$indicatorColor:"labelMuted",children:"Muted"})]});export{d as App};
