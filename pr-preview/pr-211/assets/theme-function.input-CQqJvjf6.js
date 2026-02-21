import{j as r,Q as s,t as i,c}from"./index-FP_Cx-M0.js";const n=i,d=c.button`
  padding: 12px 16px;
  background-color: ${e=>e.theme.color.primaryColor};
  color: white;
  border-radius: 4px;
  border-width: 2px;
  border-style: solid;
  border-color: ${e=>e.theme.color.bgBorderFaint};
`,t=c.div`
  padding: 16px;
  background-color: ${e=>e.theme.color.bgBase};
  border-radius: 8px;
`,l=()=>r.jsx(s,{theme:n,children:r.jsxs("div",{style:{display:"flex",gap:"12px",padding:"12px"},children:[r.jsx(t,{children:r.jsx(d,{children:"Base Theme"})}),r.jsx(s,{theme:e=>{const o=e??i;return{...o,isDark:!o.isDark}},children:r.jsx(t,{children:r.jsx(d,{children:"Extended Theme"})})})]})});export{l as App};
