import{j as o,c as l}from"./index-RJiJAdu7.js";const r=l.div.withConfig({shouldForwardProp:e=>!["column","reverse"].includes(e)})`
  display: flex;
  flex-direction: ${({column:e,reverse:d})=>e?d?"column-reverse":"column":d?"row-reverse":"row"};
  gap: 8px;
  padding: 16px;
  background-color: #f0f0f0;
`,n=()=>o.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:16,padding:16},children:[o.jsxs(r,{children:[o.jsx("div",{style:{padding:8,backgroundColor:"#bf4f74",color:"white"},children:"Row"}),o.jsx("div",{style:{padding:8,backgroundColor:"#4f74bf",color:"white"},children:"Default"})]}),o.jsxs(r,{column:!0,children:[o.jsx("div",{style:{padding:8,backgroundColor:"#bf4f74",color:"white"},children:"Column"}),o.jsx("div",{style:{padding:8,backgroundColor:"#4f74bf",color:"white"},children:"Down"})]}),o.jsxs(r,{reverse:!0,children:[o.jsx("div",{style:{padding:8,backgroundColor:"#bf4f74",color:"white"},children:"Row"}),o.jsx("div",{style:{padding:8,backgroundColor:"#4f74bf",color:"white"},children:"Reverse"})]}),o.jsxs(r,{column:!0,reverse:!0,children:[o.jsx("div",{style:{padding:8,backgroundColor:"#bf4f74",color:"white"},children:"Column"}),o.jsx("div",{style:{padding:8,backgroundColor:"#4f74bf",color:"white"},children:"Reverse"})]})]});export{n as App};
