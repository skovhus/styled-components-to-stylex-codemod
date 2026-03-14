import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-BEHMEpNn.js";import{C as n}from"./helpers-0uNrjOm7.js";var r=e(),i=t.p`
  font-size: 14px;
  ${e=>e.$truncate?n():``}
`,a=t.p`
  font-size: 14px;
  ${e=>e.$noTruncate?``:n()}
`,o=t(`div`)`
  font-size: 50px;
  ${e=>e.$truncateTitle?n():``}
  ${e=>e.maxWidth&&`max-width: ${e.maxWidth}px;`}
`,s=()=>(0,r.jsxs)(`div`,{style:{width:200,border:`1px solid #ccc`,padding:8},children:[(0,r.jsx)(o,{$truncateTitle:!0,maxWidth:200,children:`Truncated title`}),(0,r.jsx)(i,{children:`Normal text without truncation that can wrap to multiple lines`}),(0,r.jsx)(i,{$truncate:!0,children:`Truncated text that will have ellipsis when it overflows the container width`}),(0,r.jsx)(a,{$noTruncate:!0,children:`Normal text without truncation that can wrap to multiple lines`}),(0,r.jsx)(a,{children:`Truncated text that will have ellipsis when it overflows`})]});export{s as App};