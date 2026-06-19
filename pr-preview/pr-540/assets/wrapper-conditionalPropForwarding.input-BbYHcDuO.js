import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-CWv6t7He.js";t();var r=e();function i(e){let{label:t,compact:n,highlighted:i,className:a,style:o}=e;return(0,r.jsx)(`div`,{className:a,style:o,children:(0,r.jsx)(`span`,{style:{fontWeight:i?`bold`:`normal`},children:n?t.slice(0,3):t})})}var a=n(i)`
  background-color: #e0e0e0;
  padding: 12px;
  min-width: 80px;
  min-height: 40px;
  ${e=>e.compact?`transform: scale(0.75);`:``}
  ${e=>e.highlighted?`border: 2px solid blue;`:``}
`,o=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,gap:12,padding:16},children:[(0,r.jsx)(a,{label:`Default`}),(0,r.jsx)(a,{label:`Compact`,compact:!0}),(0,r.jsx)(a,{label:`Highlighted`,highlighted:!0}),(0,r.jsx)(a,{label:`Both`,compact:!0,highlighted:!0})]});export{o as App,a as Card};