import{j as i,c as n,s as c}from"./index-DkGxyC9P.js";const t=n.div`
  position: absolute;
  ${e=>e.$zIndex!==void 0&&`z-index: ${e.$zIndex};`}
`,s=n.img`
  width: 100px;
  ${({$isBw:e})=>e&&c`
      filter: grayscale(100%);
    `}
`,o=n.p`
  font-size: 14px;
  ${e=>e.$renderingContext==="dialog"&&e.$lines===1&&c`
      background-color: hotpink;
    `}
`,r=n.div`
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.06);
  ${e=>e.$isDraggingOver&&`box-shadow: inset 0 0 0 1px ${e.theme.color.primaryColor}, 0px 1px 2px rgba(0, 0, 0, 0.06);`}
`,d=n.div`
  padding: 16px;
  ${e=>e.$isHighlighted&&`border: 1px solid ${e.theme.color.primaryColor}; box-shadow: 0 0 8px ${e.theme.color.bgSub};`}
`,x=n.div`
  padding: 8px;
  ${e=>e.$isDisconnected?`background-color: ${e.theme.color.bgSub};`:void 0}
`,l=()=>i.jsxs("div",{children:[i.jsx(t,{$zIndex:5,children:"With z-index"}),i.jsx(t,{children:"Without z-index"}),i.jsx(s,{$isBw:!0,src:"https://picsum.photos/100"}),i.jsx(s,{$isBw:!1,src:"https://picsum.photos/100"}),i.jsx(o,{$renderingContext:"dialog",$lines:1,children:"Both conditions met"}),i.jsx(o,{$renderingContext:"dialog",$lines:2,children:"Only renderingContext met"}),i.jsx(o,{$renderingContext:"page",$lines:1,children:"Only lines met"}),i.jsx(o,{children:"Neither condition met"}),i.jsx(r,{$isDraggingOver:!0,children:"Dragging"}),i.jsx(r,{$isDraggingOver:!1,children:"Not dragging"}),i.jsx(d,{$isHighlighted:!0,children:"Highlighted"}),i.jsx(d,{$isHighlighted:!1,children:"Normal"}),i.jsx(x,{$isDisconnected:!0,children:"Disconnected"}),i.jsx(x,{children:"Connected"})]});export{l as App,d as Card,r as DropZone,x as StatusBar};
