import{j as n,c as r,s as d}from"./index-gYhsT2UO.js";function l(e){return n.jsx("span",{className:e.className,style:e.style,children:e.children})}function c(e){const{$isExpanded:t,...o}=e;return n.jsx(l,{...o,children:n.jsx("svg",{viewBox:"0 0 16 16",children:n.jsx("path",{d:t?"M3 10L8 5L13 10":"M3 6L8 11L13 6"})})})}const i=r(c)`
  transition: transform 0.15s ease;
  cursor: pointer;
  padding: 4px;
  ${e=>e.$isExpanded&&d`
      transform: rotate(180deg);
    `}
`,s=r.div`
  display: inline-flex;
  align-items: center;
  padding: ${e=>e.$compact?"2px 6px":"4px 12px"};
  border-radius: 12px;
  font-size: ${e=>e.$compact?"11px":"13px"};
  background-color: ${e=>e.$variant==="success"?"green":e.$variant==="warning"?"orange":"red"};
  color: white;
`,a=r.span`
  font-weight: ${e=>e.$bold?700:400};
`,x=r.div`
  background-color: ${e=>e.$color};
  color: ${e=>e.color};
  padding: 4px 8px;
  border-radius: 4px;
`;function $(){return n.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:12,padding:16},children:[n.jsxs("div",{style:{display:"flex",gap:8},children:[n.jsx(i,{$isExpanded:!0,children:"Expanded"}),n.jsx(i,{$isExpanded:!1,children:"Collapsed"})]}),n.jsxs("div",{style:{display:"flex",gap:8},children:[n.jsx(s,{$variant:"success",children:"OK"}),n.jsx(s,{$variant:"warning",$compact:!0,children:"Warn"}),n.jsx(s,{$variant:"error",$compact:!1,children:"Fail"})]}),n.jsx(a,{$bold:!0,children:"Bold text"}),n.jsx(a,{children:"Normal text"}),n.jsx(x,{$color:"blue",color:"white",children:"Collision kept"})]})}export{$ as App,x as ColorChip,s as StatusBadge,i as TreeToggle};
