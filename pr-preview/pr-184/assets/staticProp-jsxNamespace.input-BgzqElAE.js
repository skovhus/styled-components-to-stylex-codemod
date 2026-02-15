import{j as e,a as s}from"./index-CODQdQQx.js";const d=l=>e.jsx("div",{className:l.className,children:l.children});d.Section=l=>e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:6},children:[e.jsx("strong",{children:l.title}),l.children]});d.Item=l=>e.jsx("div",{style:{padding:"6px 8px",border:"1px solid #d0d7e2",borderRadius:6,backgroundColor:"#ffffff"},children:l.label});d.Separator=()=>e.jsx("div",{style:{height:2,backgroundColor:"#d0d7e2",borderRadius:999}});const i=s(d)`
  min-width: 220px;
  padding-block: 10px;
  padding-inline: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 2px solid #2563eb;
  border-radius: 10px;
  background-color: #eef6ff;
`;function n(){return e.jsx("div",{style:{display:"flex",gap:16,padding:16},children:e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:8},children:[e.jsx("strong",{children:"Namespaces only"}),e.jsxs(i.Section,{title:"Fruits",children:[e.jsx(i.Item,{label:"Apple"}),e.jsx(i.Item,{label:"Banana"})]}),e.jsx(i.Separator,{}),e.jsx(i.Section,{title:"Veggies",children:e.jsx(i.Item,{label:"Carrot"})})]})})}export{n as App};
