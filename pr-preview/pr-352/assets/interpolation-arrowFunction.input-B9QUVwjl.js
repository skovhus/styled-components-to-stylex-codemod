import{j as t,c as o}from"./index-DfKOu5b3.js";const d=o.div`
  background: ${i=>i.$direction==="horizontal"?"linear-gradient(90deg, #bf4f74, #3498db)":"linear-gradient(180deg, #bf4f74, #3498db)"};
  padding: 24px;
`,e=o.div`
  padding: 12px 16px;
  border-bottom: ${i=>i.$isActive?"2px solid #bf4f74":"2px solid transparent"};
  cursor: pointer;
`,r=o.div`
  position: absolute;
  left: 10px;
  bottom: ${i=>i.$large?80:20}px;
  padding: 12px 16px;
  background-color: paleturquoise;
  border: 2px solid teal;
`,a=()=>t.jsxs("div",{children:[t.jsx(d,{$direction:"horizontal",children:"Horizontal Gradient"}),t.jsx(e,{$isActive:!0,children:"Active Tab"}),t.jsx(e,{children:"Inactive Tab"}),t.jsxs("div",{style:{position:"relative",height:"200px"},children:[t.jsx(r,{$large:!0,children:"Large Box (bottom: 80px)"}),t.jsx(r,{style:{left:200},children:"Small Box (bottom: 20px)"})]})]});export{a as App};
