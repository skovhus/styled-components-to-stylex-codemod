import{j as a,a as o}from"./index-D4fBXR7t.js";const p=o.a`
  display: flex;
  align-items: center;
  padding: 5px 10px;
  background: papayawhip;
  color: #bf4f74;
`,s=o.span`
  padding: 4px 8px;
  background: ${e=>e.theme.color.bgSub};

  ${p}:focus-visible & {
    outline: 2px solid ${e=>e.theme.color.labelBase};
  }
`,n=()=>a.jsxs(p,{href:"#",children:[a.jsx(s,{children:"Label"}),"Hover me"]});export{n as App};
