import{j as r,o as d,t as i,d as n}from"./index-CizWbUBP.js";const a=i,s=n.button`
  padding: 12px 16px;
  background-color: ${e=>e.theme.color.primaryColor};
  color: white;
  border-radius: 4px;
  border-width: 2px;
  border-style: solid;
  border-color: ${e=>e.theme.color.bgBorderFaint};
`,t=n.div`
  padding: 16px;
  background-color: ${e=>e.theme.color.bgBase};
  border-radius: 8px;
`,l=()=>r.jsx(d,{theme:a,children:r.jsxs("div",{style:{display:"flex",gap:"12px",padding:"12px"},children:[r.jsx(t,{children:r.jsx(s,{children:"Base Theme"})}),r.jsx(d,{theme:e=>{const o=e??i;return{...o,isDark:!o.isDark}},children:r.jsx(t,{children:r.jsx(s,{children:"Extended Theme"})})})]})});export{l as App};
