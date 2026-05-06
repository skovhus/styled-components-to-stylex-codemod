import"./chunk-jRWAZmH_.js";import{c as e,m as t,p as n}from"./index-Cp4ZDml8.js";t();var r=n(),i=e.label`
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 11px;
  color: ${e=>e.$disabled?e.theme.color.labelMuted:e.theme.color.labelBase};
  cursor: ${e=>e.$disabled?`not-allowed`:`pointer`};
`,a=e.div`
  padding: 12px;
  background-color: ${e=>e.theme.color.bgBase};
  border-left: ${e=>e.$isHighlighted?`2px solid ${e.theme.color.greenBase}`:`2px solid transparent`};
`,o=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:12,padding:16},children:[(0,r.jsx)(i,{children:`Enabled`}),(0,r.jsx)(i,{$disabled:!0,children:`Disabled`}),(0,r.jsx)(a,{children:`Default box`}),(0,r.jsx)(a,{$isHighlighted:!0,children:`Highlighted box`})]});export{o as App};