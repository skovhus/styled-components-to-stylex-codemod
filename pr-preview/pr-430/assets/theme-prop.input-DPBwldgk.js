import{f as e,s as t}from"./index-Do6YQwZ3.js";import{C as n}from"./helpers-B-LPR8QG.js";var r=e(),i=t.div`
  height: 100px;
  width: 100px;
  ${e=>e.theme.isDark?`padding: ${n()};`:`padding: 100px;`}
`,a=t.div`
  height: 100px;
  width: 100px;
  ${e=>e.theme.mode===`dark`?`color: white;`:`color: black;`}
`,o=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(i,{children:`Theme prop`}),(0,r.jsx)(a,{children:`Theme mode`})]});export{o as App};