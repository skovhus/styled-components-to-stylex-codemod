import{j as e,d as o}from"./index-B_Qk8Tgf.js";import{a as r}from"./helpers-CoW0g6cs.js";const d=o.header`
  display: flex;
  padding: 16px;
  background: #f0f0f0;
  &:not(:only-child) {
    border-bottom: ${r()} solid var(--settings-list-view-border-color);
  }
`,i=o.div`
  --settings-list-view-border-color: #bf4f74;
  display: flex;
  flex-direction: column;
  gap: 8px;
`,l=()=>e.jsxs(i,{children:[e.jsx(d,{children:"Header 1 (has border because not only child)"}),e.jsx(d,{children:"Header 2 (has border because not only child)"}),e.jsx("div",{style:{padding:16,background:"#e0e0e0"},children:e.jsx(d,{children:"Header 3 (no border - only child of this div)"})})]});export{l as App,d as StyledHeader};
