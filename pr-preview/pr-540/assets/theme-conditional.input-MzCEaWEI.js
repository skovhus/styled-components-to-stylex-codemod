import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-xibBjGTp.js";t();var r=e(),i=n.label`
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 11px;
  color: ${e=>e.$disabled?e.theme.color.labelMuted:e.theme.color.labelBase};
  cursor: ${e=>e.$disabled?`not-allowed`:`pointer`};
`,a=n.div`
  padding: 12px;
  background-color: ${e=>e.theme.color.bgBase};
  border-left: ${e=>e.$isHighlighted?`2px solid ${e.theme.color.greenBase}`:`2px solid transparent`};
`,o=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:12,padding:16},children:[(0,r.jsx)(i,{children:`Enabled`}),(0,r.jsx)(i,{$disabled:!0,children:`Disabled`}),(0,r.jsx)(a,{children:`Default box`}),(0,r.jsx)(a,{$isHighlighted:!0,children:`Highlighted box`})]});export{o as App};