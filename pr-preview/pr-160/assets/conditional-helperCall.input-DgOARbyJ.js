import{j as e,d as i}from"./index-BtEqQ3JB.js";import{t as n}from"./helpers-DBiORN-4.js";const r=i.p`
  font-size: 14px;
  ${t=>t.$truncate?n():""}
`,a=i.p`
  font-size: 14px;
  ${t=>t.$noTruncate?"":n()}
`,l=i("div")`
  font-size: 50px;
  ${t=>t.$truncateTitle?n():""}
  ${t=>t.maxWidth&&`max-width: ${t.maxWidth}px;`}
`,s=()=>e.jsxs("div",{style:{width:200,border:"1px solid #ccc",padding:8},children:[e.jsx(l,{$truncateTitle:!0,maxWidth:200,children:"Truncated title"}),e.jsx(r,{children:"Normal text without truncation that can wrap to multiple lines"}),e.jsx(r,{$truncate:!0,children:"Truncated text that will have ellipsis when it overflows the container width"}),e.jsx(a,{$noTruncate:!0,children:"Normal text without truncation that can wrap to multiple lines"}),e.jsx(a,{children:"Truncated text that will have ellipsis when it overflows"})]});export{s as App};
