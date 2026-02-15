import{j as l,a as s}from"./index-Bf_0D0rs.js";const a=s.label`
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 11px;
  color: ${e=>e.$disabled?e.theme.color.labelMuted:e.theme.color.labelBase};
  cursor: ${e=>e.$disabled?"not-allowed":"pointer"};
`,i=()=>l.jsxs("div",{children:[l.jsx(a,{children:"Enabled"}),l.jsx(a,{$disabled:!0,children:"Disabled"})]});export{i as App};
