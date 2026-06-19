import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,u as n}from"./index-BCTsKAj3.js";var r=e(),i=n.div`
  position: absolute;
  ${e=>e.$zIndex!==void 0&&`z-index: ${e.$zIndex};`}
`,a=n.img`
  width: 100px;
  ${({$isBw:e})=>e&&t`
      filter: grayscale(100%);
    `}
`,o=n.p`
  font-size: 14px;
  ${e=>e.$renderingContext===`dialog`&&e.$lines===1&&t`
      background-color: hotpink;
    `}
`,s=n.div`
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.06);
  ${e=>e.$isDraggingOver&&`box-shadow: inset 0 0 0 1px ${e.theme.color.primaryColor}, 0px 1px 2px rgba(0, 0, 0, 0.06);`}
`,c=n.div`
  padding: 16px;
  ${e=>e.$isHighlighted&&`border: 1px solid ${e.theme.color.primaryColor}; box-shadow: 0 0 8px ${e.theme.color.bgSub};`}
`,l=n.div`
  padding: 8px;
  ${e=>e.$isDisconnected?`background-color: ${e.theme.color.bgSub};`:void 0}
`,u=n.div`
  ${e=>e.$hot&&`color: red;`}
  color: blue;
  padding: 4px;
`,d=n.div`
  ${e=>e.$hot&&`color: red !important;`}
  color: blue;
  padding: 4px;
`,f=n.div`
  color: ${e=>e.$hot?`red`:void 0} !important;
  color: blue;
  padding: 4px;
`,p=n.div`
  opacity: ${e=>e.$hot?1:void 0} !important;
  opacity: 0.5;
  padding: 4px;
`,m=n.div`
  color: ${e=>e.$hot?e.theme.color.primaryColor:void 0} !important;
  color: blue;
  padding: 4px;
`,h=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(i,{$zIndex:5,children:`With z-index`}),(0,r.jsx)(i,{children:`Without z-index`}),(0,r.jsx)(a,{$isBw:!0,src:`https://picsum.photos/100`}),(0,r.jsx)(a,{$isBw:!1,src:`https://picsum.photos/100`}),(0,r.jsx)(o,{$renderingContext:`dialog`,$lines:1,children:`Both conditions met`}),(0,r.jsx)(o,{$renderingContext:`dialog`,$lines:2,children:`Only renderingContext met`}),(0,r.jsx)(o,{$renderingContext:`page`,$lines:1,children:`Only lines met`}),(0,r.jsx)(o,{children:`Neither condition met`}),(0,r.jsx)(s,{$isDraggingOver:!0,children:`Dragging`}),(0,r.jsx)(s,{$isDraggingOver:!1,children:`Not dragging`}),(0,r.jsx)(c,{$isHighlighted:!0,children:`Highlighted`}),(0,r.jsx)(c,{$isHighlighted:!1,children:`Normal`}),(0,r.jsx)(l,{$isDisconnected:!0,children:`Disconnected`}),(0,r.jsx)(l,{children:`Connected`}),(0,r.jsx)(u,{$hot:!0,children:`Hot (still blue)`}),(0,r.jsx)(u,{children:`Default (blue)`}),(0,r.jsx)(d,{$hot:!0,children:`Hot (red, important)`}),(0,r.jsx)(d,{children:`Default (blue)`}),(0,r.jsx)(f,{$hot:!0,children:`Hot (red, important)`}),(0,r.jsx)(f,{children:`Default (blue)`}),(0,r.jsx)(p,{$hot:!0,children:`Hot (opacity 1, important)`}),(0,r.jsx)(p,{children:`Default (opacity 0.5)`}),(0,r.jsx)(m,{$hot:!0,children:`Hot (token color, important)`}),(0,r.jsx)(m,{children:`Default (blue)`})]});export{h as App,c as Card,s as DropZone,l as StatusBar};