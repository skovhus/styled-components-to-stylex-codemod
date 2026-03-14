import{j as l,c as t}from"./index-BYrzxWnm.js";const i=t.label`
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 11px;
  color: ${e=>e.$disabled?e.theme.color.labelMuted:e.theme.color.labelBase};
  cursor: ${e=>e.$disabled?"not-allowed":"pointer"};
`,o=t.div`
  padding: 12px;
  background-color: ${e=>e.theme.color.bgBase};
  border-left: ${e=>e.$isHighlighted?`2px solid ${e.theme.color.greenBase}`:"2px solid transparent"};
`,s=()=>l.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:12,padding:16},children:[l.jsx(i,{children:"Enabled"}),l.jsx(i,{$disabled:!0,children:"Disabled"}),l.jsx(o,{children:"Default box"}),l.jsx(o,{$isHighlighted:!0,children:"Highlighted box"})]});export{s as App};
