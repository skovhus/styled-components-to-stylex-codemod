import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-GfnpIRuu.js";e(t(),1);var i=n();function a(e){let{label:t,compact:n,highlighted:r,className:a,style:o}=e;return(0,i.jsx)(`div`,{className:a,style:o,children:(0,i.jsx)(`span`,{style:{fontWeight:r?`bold`:`normal`},children:n?t.slice(0,3):t})})}var o=r(a)`
  background-color: #e0e0e0;
  padding: 12px;
  min-width: 80px;
  min-height: 40px;
  ${e=>e.compact?`transform: scale(0.75);`:``}
  ${e=>e.highlighted?`border: 2px solid blue;`:``}
`,s=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:12,padding:16},children:[(0,i.jsx)(o,{label:`Default`}),(0,i.jsx)(o,{label:`Compact`,compact:!0}),(0,i.jsx)(o,{label:`Highlighted`,highlighted:!0}),(0,i.jsx)(o,{label:`Both`,compact:!0,highlighted:!0})]});export{s as App,o as Card};