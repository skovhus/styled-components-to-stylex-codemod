import{j as e,c as t}from"./index-C8Fi2W22.js";const n=t.h1`
  ${i=>i.$upsideDown&&"transform: rotate(180deg);"}
  text-align: center;
  color: #BF4F74;
`,o=t.div`
  padding: 1rem;
  background: ${i=>i.$isActive?"mediumseagreen":"papayawhip"};
  opacity: ${i=>i.$isDisabled?.5:1};
  cursor: ${i=>i.$isDisabled?"not-allowed":"pointer"};
`,d=t.span`
  font-weight: var(--font-weight-medium);
  ${i=>i.$dim?"opacity: 0.5;":""}
`,s=t.div`
  ${i=>i.$open?"":"pointer-events: none; opacity: 0.1;"}
`,l=t.div`
  inset: 0;
  ${i=>i.$visible?"opacity: 1;":"opacity: 0;"}
`,r=i=>e.jsx("button",{...i}),c=t(r)`
  ${i=>i.useRoundStyle!==!1&&"border-radius: 100%;"}
  padding: 4px;
`,p=()=>e.jsxs("div",{children:[e.jsx(n,{children:"Normal Title"}),e.jsx(n,{$upsideDown:!0,children:"Upside Down Title"}),e.jsx(o,{children:"Normal Box"}),e.jsx(o,{$isActive:!0,children:"Active Box"}),e.jsx(o,{$isDisabled:!0,children:"Disabled Box"}),e.jsx(d,{$dim:!0,children:"Dim"}),e.jsx(d,{$dim:!1,children:"No dim"}),e.jsx(s,{$open:!0,children:"Visible tooltip"}),e.jsx(s,{$open:!1,children:"Hidden tooltip"}),e.jsx(s,{children:"Default hidden tooltip"}),e.jsx(l,{$visible:!0,children:"Visible overlay"}),e.jsx(l,{$visible:!1,children:"Hidden overlay"}),e.jsx(c,{children:"Icon"})]});export{p as App,d as Highlight,l as Overlay,s as Tooltip};
