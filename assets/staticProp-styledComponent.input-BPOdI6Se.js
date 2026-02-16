import{j as e,a as r}from"./index-DFXeNFZE.js";const a=i=>e.jsx("div",{className:i.className,children:i.children});a.Option=i=>e.jsx("div",{"data-value":i.value,children:i.children});a.Group=i=>e.jsx("div",{"data-label":i.label,children:i.children});a.Separator=()=>e.jsx("hr",{});const l=r(a)`
  width: 240px;
  min-height: 140px;
  padding-block: 12px;
  padding-inline: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 2px solid #2f2f2f;
  border-radius: 8px;
  background-color: #f6f7fb;
  color: #1c1c1c;
`;function s(){return e.jsxs("div",{style:{display:"flex",gap:16,padding:16},children:[e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:8},children:[e.jsx("strong",{children:"Default"}),e.jsxs(l,{children:[e.jsxs(l.Group,{label:"Fruits",children:[e.jsx(l.Option,{value:"apple",children:"Apple"}),e.jsx(l.Option,{value:"banana",children:"Banana"})]}),e.jsx(l.Separator,{}),e.jsx(l.Group,{label:"Vegetables",children:e.jsx(l.Option,{value:"carrot",children:"Carrot"})})]})]}),e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:8},children:[e.jsx("strong",{children:"Favorites"}),e.jsxs(l,{children:[e.jsxs(l.Group,{label:"Top picks",children:[e.jsx(l.Option,{value:"mango",children:"Mango"}),e.jsx(l.Option,{value:"broccoli",children:"Broccoli"})]}),e.jsx(l.Separator,{}),e.jsx(l.Option,{value:"water",children:"Water"})]})]})]})}export{s as App};
