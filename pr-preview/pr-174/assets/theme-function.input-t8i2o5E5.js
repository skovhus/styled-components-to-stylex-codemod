import{j as r,K as s,t as a,a as i}from"./index-Du-06Hd9.js";const n=a,d=i.button`
  padding: 12px 16px;
  background-color: ${e=>e.theme.color.primaryColor};
  color: white;
  border-radius: 4px;
  border-width: 2px;
  border-style: solid;
  border-color: ${e=>e.theme.color.bgBorderFaint};
`,t=i.div`
  padding: 16px;
  background-color: ${e=>e.theme.color.bgBase};
  border-radius: 8px;
`,l=()=>r.jsx(s,{theme:n,children:r.jsxs("div",{style:{display:"flex",gap:"12px",padding:"12px"},children:[r.jsx(t,{children:r.jsx(d,{children:"Base Theme"})}),r.jsx(s,{theme:e=>{const o=e??a;return{...o,isDark:!o.isDark}},children:r.jsx(t,{children:r.jsx(d,{children:"Extended Theme"})})})]})});export{l as App};
