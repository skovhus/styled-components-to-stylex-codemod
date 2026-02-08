import{j as r,a as e}from"./index-CXAkzOdL.js";const o=e.h1`
  ${i=>i.$upsideDown&&"transform: rotate(180deg);"}
  text-align: center;
  color: #bf4f74;
`,d=e.div`
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.06);
  ${i=>i.$isDraggingOver&&`box-shadow: inset 0 0 0 1px ${i.theme.color.primaryColor}, 0px 1px 2px rgba(0, 0, 0, 0.06);`}
`,s=e.div`
  padding: 16px;
  ${i=>i.$isHighlighted&&`border: 1px solid ${i.theme.color.primaryColor}; box-shadow: 0 0 8px ${i.theme.color.bgSub};`}
`,t=()=>r.jsxs("div",{children:[r.jsx(o,{children:"Normal Title"}),r.jsx(o,{$upsideDown:!0,children:"Upside Down Title"}),r.jsx(d,{$isDraggingOver:!0,children:"Dragging"}),r.jsx(d,{$isDraggingOver:!1,children:"Not dragging"}),r.jsx(s,{$isHighlighted:!0,children:"Highlighted"}),r.jsx(s,{$isHighlighted:!1,children:"Normal"})]});export{t as App,s as Card,d as DropZone};
