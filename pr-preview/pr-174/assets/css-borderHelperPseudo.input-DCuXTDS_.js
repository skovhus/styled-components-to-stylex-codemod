import{j as e,a as r}from"./index-6VWU0kVj.js";import{a as d}from"./helpers-BMbFRALM.js";const o=r.header`
  display: flex;
  padding: 16px;
  background: #f0f0f0;
  &:not(:only-child) {
    border-bottom: ${d()} solid var(--settings-list-view-border-color);
  }
`,i=r.div`
  --settings-list-view-border-color: #bf4f74;
  display: flex;
  flex-direction: column;
  gap: 8px;
`,l=()=>e.jsxs(i,{children:[e.jsx(o,{children:"Header 1 (has border because not only child)"}),e.jsx(o,{children:"Header 2 (has border because not only child)"}),e.jsx("div",{style:{padding:16,background:"#e0e0e0"},children:e.jsx(o,{children:"Header 3 (no border - only child of this div)"})})]});export{l as App,o as StyledHeader};
