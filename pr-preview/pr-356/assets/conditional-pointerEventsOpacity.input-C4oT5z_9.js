import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-DRa1uduC.js";import{t as n}from"./flex-D9zwId_E.js";var r=e(),i=t(n)`
  opacity: ${e=>e.$open?1:0};
  transition: opacity ${e=>e.$duration}ms;
  transition-delay: ${e=>e.$open?e.$delay:0}ms;
  pointer-events: ${e=>e.$open?`inherit`:`none`};
`,a=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,gap:`16px`},children:[(0,r.jsx)(i,{$open:!0,$delay:100,$duration:300,children:(0,r.jsx)(`button`,{style:{padding:`8px 16px`},children:`Visible and clickable`})}),(0,r.jsx)(i,{$open:!1,$delay:0,$duration:200,children:(0,r.jsx)(`button`,{style:{padding:`8px 16px`},children:`Hidden and not clickable`})})]});export{a as App};