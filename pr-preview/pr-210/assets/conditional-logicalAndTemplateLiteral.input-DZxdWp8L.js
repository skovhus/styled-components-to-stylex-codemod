import{j as i,a as r}from"./index-DeUnwoPj.js";const o=r.h1`
  ${e=>e.$upsideDown&&"transform: rotate(180deg);"}
  text-align: center;
  color: #bf4f74;
`,d=r.div`
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.06);
  ${e=>e.$isDraggingOver&&`box-shadow: inset 0 0 0 1px ${e.theme.color.primaryColor}, 0px 1px 2px rgba(0, 0, 0, 0.06);`}
`,n=r.div`
  padding: 16px;
  ${e=>e.$isHighlighted&&`border: 1px solid ${e.theme.color.primaryColor}; box-shadow: 0 0 8px ${e.theme.color.bgSub};`}
`,s=r.div`
  padding: 8px;
  ${e=>e.$isDisconnected?`background-color: ${e.theme.color.bgSub};`:void 0}
`,g=()=>i.jsxs("div",{children:[i.jsx(o,{children:"Normal Title"}),i.jsx(o,{$upsideDown:!0,children:"Upside Down Title"}),i.jsx(d,{$isDraggingOver:!0,children:"Dragging"}),i.jsx(d,{$isDraggingOver:!1,children:"Not dragging"}),i.jsx(n,{$isHighlighted:!0,children:"Highlighted"}),i.jsx(n,{$isHighlighted:!1,children:"Normal"}),i.jsx(s,{$isDisconnected:!0,children:"Disconnected"}),i.jsx(s,{children:"Connected"})]});export{g as App,n as Card,d as DropZone,s as StatusBar};
