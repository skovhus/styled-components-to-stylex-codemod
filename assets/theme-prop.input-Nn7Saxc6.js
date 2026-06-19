import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-CAVTIZGV.js";import{D as n}from"./helpers-Bb4h6a84.js";var r=e(),i=t.div`
  height: 100px;
  width: 100px;
  ${e=>e.theme.isDark?`padding: ${n()};`:`padding: 100px;`}
`,a=t.div`
  height: 100px;
  width: 100px;
  ${e=>e.theme.mode===`dark`?`color: white;`:`color: black;`}
`,o=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(i,{children:`Theme prop`}),(0,r.jsx)(a,{children:`Theme mode`})]});export{o as App};