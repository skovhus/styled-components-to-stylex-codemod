import{c as e,p as t}from"./index-CRXIG_Fi.js";import{w as n}from"./helpers-lU8UsZPn.js";var r=t(),i=e.header`
  display: flex;
  padding: 16px;
  background: #f0f0f0;
  &:not(:only-child) {
    border-bottom: ${n()} solid var(--settings-list-view-border-color);
  }
`,a=e.div`
  --settings-list-view-border-color: #bf4f74;
  display: flex;
  flex-direction: column;
  gap: 8px;
`,o=()=>(0,r.jsxs)(a,{children:[(0,r.jsx)(i,{children:`Header 1 (has border because not only child)`}),(0,r.jsx)(i,{children:`Header 2 (has border because not only child)`}),(0,r.jsx)(`div`,{style:{padding:16,background:`#e0e0e0`},children:(0,r.jsx)(i,{children:`Header 3 (no border - only child of this div)`})})]});export{o as App,i as StyledHeader};