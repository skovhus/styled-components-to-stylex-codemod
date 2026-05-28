import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t,p as n}from"./index-CIMfLdoW.js";n();var r=e();function i({selected:e,highlighted:t,children:n,...i}){return(0,r.jsxs)(`div`,{...i,children:[e&&(0,r.jsx)(`span`,{children:`★`}),(0,r.jsx)(`span`,{style:{opacity:t?.7:1},children:n})]})}var a=t(i)`
  padding: 8px 12px;
  border-radius: 4px;
  background: #f0f0f0;
  ${e=>e.highlighted?`transform: scale(0.9);`:``}
`,o=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,r.jsx)(a,{children:`Default`}),(0,r.jsx)(a,{selected:!0,children:`Selected (should show ★)`}),(0,r.jsx)(a,{highlighted:!0,children:`Highlighted (should be 0.7 opacity + scaled)`}),(0,r.jsx)(a,{highlighted:!0,selected:!0,children:`Both (should show ★ + 0.7 opacity + scaled)`})]});export{o as App};