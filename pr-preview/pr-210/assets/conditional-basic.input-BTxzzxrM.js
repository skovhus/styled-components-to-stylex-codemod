import{j as i,a as r}from"./index-YN29Czn-.js";const o=r.h1`
  ${e=>e.$upsideDown&&"transform: rotate(180deg);"}
  text-align: center;
  color: #BF4F74;
`,s=r.div`
  padding: 1rem;
  background: ${e=>e.$isActive?"mediumseagreen":"papayawhip"};
  opacity: ${e=>e.$isDisabled?.5:1};
  cursor: ${e=>e.$isDisabled?"not-allowed":"pointer"};
`,a=()=>i.jsxs("div",{children:[i.jsx(o,{children:"Normal Title"}),i.jsx(o,{$upsideDown:!0,children:"Upside Down Title"}),i.jsx(s,{children:"Normal Box"}),i.jsx(s,{$isActive:!0,children:"Active Box"}),i.jsx(s,{$isDisabled:!0,children:"Disabled Box"})]});export{a as App};
