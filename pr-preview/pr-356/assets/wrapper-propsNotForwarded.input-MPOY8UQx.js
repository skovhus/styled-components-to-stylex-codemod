import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-DRa1uduC.js";e(t(),1);var i=n();function a({selected:e,highlighted:t,children:n,...r}){return(0,i.jsxs)(`div`,{...r,children:[e&&(0,i.jsx)(`span`,{children:`★`}),(0,i.jsx)(`span`,{style:{opacity:t?.7:1},children:n})]})}var o=r(a)`
  padding: 8px 12px;
  border-radius: 4px;
  background: #f0f0f0;
  ${e=>e.highlighted?`transform: scale(0.9);`:``}
`,s=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,i.jsx)(o,{children:`Default`}),(0,i.jsx)(o,{selected:!0,children:`Selected (should show ★)`}),(0,i.jsx)(o,{highlighted:!0,children:`Highlighted (should be 0.7 opacity + scaled)`}),(0,i.jsx)(o,{highlighted:!0,selected:!0,children:`Both (should show ★ + 0.7 opacity + scaled)`})]});export{s as App};