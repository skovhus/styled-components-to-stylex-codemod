import{j as o,c as a}from"./index-FP_Cx-M0.js";const p=a.a`
  display: flex;
  align-items: center;
  padding: 5px 10px;
  background: papayawhip;
  color: #bf4f74;
`,s=a.span`
  padding: 4px 8px;
  background: ${e=>e.theme.color.bgSub};

  ${p}:focus-visible & {
    outline: 2px solid ${e=>e.theme.color.labelBase};
  }
`,n=()=>o.jsxs(p,{href:"#",children:[o.jsx(s,{children:"Label"}),"Hover me"]});export{n as App};
