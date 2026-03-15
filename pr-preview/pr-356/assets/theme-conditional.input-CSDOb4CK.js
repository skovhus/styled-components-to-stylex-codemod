import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-BFw42tS8.js";e(t(),1);var i=n(),a=r.label`
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 11px;
  color: ${e=>e.$disabled?e.theme.color.labelMuted:e.theme.color.labelBase};
  cursor: ${e=>e.$disabled?`not-allowed`:`pointer`};
`,o=r.div`
  padding: 12px;
  background-color: ${e=>e.theme.color.bgBase};
  border-left: ${e=>e.$isHighlighted?`2px solid ${e.theme.color.greenBase}`:`2px solid transparent`};
`,s=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:12,padding:16},children:[(0,i.jsx)(a,{children:`Enabled`}),(0,i.jsx)(a,{$disabled:!0,children:`Disabled`}),(0,i.jsx)(o,{children:`Default box`}),(0,i.jsx)(o,{$isHighlighted:!0,children:`Highlighted box`})]});export{s as App};