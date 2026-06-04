import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t}from"./index-Ub7glBWt.js";import{E as n}from"./helpers-FsqG0-FE.js";var r=e(),i=t.div`
  height: 100px;
  width: 100px;
  ${e=>e.theme.isDark?`padding: ${n()};`:`padding: 100px;`}
`,a=t.div`
  height: 100px;
  width: 100px;
  ${e=>e.theme.mode===`dark`?`color: white;`:`color: black;`}
`,o=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(i,{children:`Theme prop`}),(0,r.jsx)(a,{children:`Theme mode`})]});export{o as App};