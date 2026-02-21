import{j as t,c as r}from"./index-FP_Cx-M0.js";import{t as n}from"./helpers-BIUw4OQN.js";const o=r.p`
  font-size: 14px;
  color: #333;
  padding: 8px;
  background-color: #f5f5f5;
  &:hover {
    ${e=>e.$truncate?n():""}
  }
`,s=()=>t.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:12,width:180,padding:16},children:[t.jsx(o,{children:"Normal text (no truncation)"}),t.jsx(o,{$truncate:!0,children:"Truncated text on hover - this long text overflows when you hover over it"})]});export{s as App};
