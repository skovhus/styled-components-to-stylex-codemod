import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-CvfJmPeC.js";import{x as n}from"./helpers-BtN0jKtV.js";var r=e(),i=t.header`
  display: flex;
  padding: 16px;
  background: #f0f0f0;
  &:not(:only-child) {
    border-bottom: ${n()} solid var(--settings-list-view-border-color);
  }
`,a=t.div`
  --settings-list-view-border-color: #bf4f74;
  display: flex;
  flex-direction: column;
  gap: 8px;
`,o=()=>(0,r.jsxs)(a,{children:[(0,r.jsx)(i,{children:`Header 1 (has border because not only child)`}),(0,r.jsx)(i,{children:`Header 2 (has border because not only child)`}),(0,r.jsx)(`div`,{style:{padding:16,background:`#e0e0e0`},children:(0,r.jsx)(i,{children:`Header 3 (no border - only child of this div)`})})]});export{o as App,i as StyledHeader};