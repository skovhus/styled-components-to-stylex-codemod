import{j as i,c as o}from"./index-BsKOJ0CN.js";import{a as t}from"./helpers-ttOpPaib.js";const d=o.div`
  height: 100px;
  width: 100px;
  ${e=>e.theme.isDark?`padding: ${t()};`:"padding: 100px;"}
`,h=o.div`
  height: 100px;
  width: 100px;
  ${e=>e.theme.mode==="dark"?"color: white;":"color: black;"}
`,x=()=>i.jsxs("div",{children:[i.jsx(d,{children:"Theme prop"}),i.jsx(h,{children:"Theme mode"})]});export{x as App};
