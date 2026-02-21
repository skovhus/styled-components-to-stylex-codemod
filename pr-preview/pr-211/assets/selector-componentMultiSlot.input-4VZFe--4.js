import{j as e,c as p}from"./index-FP_Cx-M0.js";const a=p.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
  color: #bf4f74;
`,r=p.span`
  padding: 4px 8px;

  ${a}:hover & {
    box-shadow: 0 4px 8px ${o=>o.theme.color.labelBase};
    border: 2px solid ${o=>o.theme.color.bgSub};
  }
`,x=()=>e.jsxs(a,{href:"#",children:[e.jsx(r,{children:"Label"}),"Hover me"]});export{x as App};
