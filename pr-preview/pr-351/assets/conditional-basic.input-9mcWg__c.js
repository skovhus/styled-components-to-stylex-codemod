import{j as e,c as t}from"./index-MdT_9Pu7.js";const o=t.h1`
  ${i=>i.$upsideDown&&"transform: rotate(180deg);"}
  text-align: center;
  color: #BF4F74;
`,s=t.div`
  padding: 1rem;
  background: ${i=>i.$isActive?"mediumseagreen":"papayawhip"};
  opacity: ${i=>i.$isDisabled?.5:1};
  cursor: ${i=>i.$isDisabled?"not-allowed":"pointer"};
`,r=t.span`
  font-weight: var(--font-weight-medium);
  ${i=>i.$dim?"opacity: 0.5;":""}
`,n=()=>e.jsxs("div",{children:[e.jsx(o,{children:"Normal Title"}),e.jsx(o,{$upsideDown:!0,children:"Upside Down Title"}),e.jsx(s,{children:"Normal Box"}),e.jsx(s,{$isActive:!0,children:"Active Box"}),e.jsx(s,{$isDisabled:!0,children:"Disabled Box"}),e.jsx(r,{$dim:!0,children:"Dim"}),e.jsx(r,{$dim:!1,children:"No dim"})]});export{n as App,r as Highlight};
