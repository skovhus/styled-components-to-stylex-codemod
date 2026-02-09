import{j as e,a as i}from"./index-B8XlG4jc.js";import{t as n}from"./helpers-D4eJCMSM.js";const a=i.p`
  font-size: 14px;
  ${t=>t.$truncate?n():""}
`,r=i.p`
  font-size: 14px;
  ${t=>t.$noTruncate?"":n()}
`,l=i("div")`
  font-size: 50px;
  ${t=>t.$truncateTitle?n():""}
  ${t=>t.maxWidth&&`max-width: ${t.maxWidth}px;`}
`,s=()=>e.jsxs("div",{style:{width:200,border:"1px solid #ccc",padding:8},children:[e.jsx(l,{$truncateTitle:!0,maxWidth:200,children:"Truncated title"}),e.jsx(a,{children:"Normal text without truncation that can wrap to multiple lines"}),e.jsx(a,{$truncate:!0,children:"Truncated text that will have ellipsis when it overflows the container width"}),e.jsx(r,{$noTruncate:!0,children:"Normal text without truncation that can wrap to multiple lines"}),e.jsx(r,{children:"Truncated text that will have ellipsis when it overflows"})]});export{s as App};
