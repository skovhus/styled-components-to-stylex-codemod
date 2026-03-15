import"./react-D4cBbUL-.js";import{f as e,s as t,u as n}from"./index-DRa1uduC.js";var r=e(),i=t.div`
  position: absolute;
  ${e=>e.$zIndex!==void 0&&`z-index: ${e.$zIndex};`}
`,a=t.img`
  width: 100px;
  ${({$isBw:e})=>e&&n`
      filter: grayscale(100%);
    `}
`,o=t.p`
  font-size: 14px;
  ${e=>e.$renderingContext===`dialog`&&e.$lines===1&&n`
      background-color: hotpink;
    `}
`,s=t.div`
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.06);
  ${e=>e.$isDraggingOver&&`box-shadow: inset 0 0 0 1px ${e.theme.color.primaryColor}, 0px 1px 2px rgba(0, 0, 0, 0.06);`}
`,c=t.div`
  padding: 16px;
  ${e=>e.$isHighlighted&&`border: 1px solid ${e.theme.color.primaryColor}; box-shadow: 0 0 8px ${e.theme.color.bgSub};`}
`,l=t.div`
  padding: 8px;
  ${e=>e.$isDisconnected?`background-color: ${e.theme.color.bgSub};`:void 0}
`,u=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(i,{$zIndex:5,children:`With z-index`}),(0,r.jsx)(i,{children:`Without z-index`}),(0,r.jsx)(a,{$isBw:!0,src:`https://picsum.photos/100`}),(0,r.jsx)(a,{$isBw:!1,src:`https://picsum.photos/100`}),(0,r.jsx)(o,{$renderingContext:`dialog`,$lines:1,children:`Both conditions met`}),(0,r.jsx)(o,{$renderingContext:`dialog`,$lines:2,children:`Only renderingContext met`}),(0,r.jsx)(o,{$renderingContext:`page`,$lines:1,children:`Only lines met`}),(0,r.jsx)(o,{children:`Neither condition met`}),(0,r.jsx)(s,{$isDraggingOver:!0,children:`Dragging`}),(0,r.jsx)(s,{$isDraggingOver:!1,children:`Not dragging`}),(0,r.jsx)(c,{$isHighlighted:!0,children:`Highlighted`}),(0,r.jsx)(c,{$isHighlighted:!1,children:`Normal`}),(0,r.jsx)(l,{$isDisconnected:!0,children:`Disconnected`}),(0,r.jsx)(l,{children:`Connected`})]});export{u as App,c as Card,s as DropZone,l as StatusBar};