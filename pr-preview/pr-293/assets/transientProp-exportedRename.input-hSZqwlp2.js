import{j as n,c as a,s as c}from"./index-DU6bk0xL.js";function l(e){return n.jsx("span",{className:e.className,style:e.style,children:e.children})}function o(e){const{$isExpanded:t,...d}=e;return n.jsx(l,{...d,children:n.jsx("svg",{viewBox:"0 0 16 16",children:n.jsx("path",{d:t?"M3 10L8 5L13 10":"M3 6L8 11L13 6"})})})}const r=a(o)`
  transition: transform 0.15s ease;
  cursor: pointer;
  padding: 4px;
  ${e=>e.$isExpanded&&c`
      transform: rotate(180deg);
    `}
`,s=a.div`
  display: inline-flex;
  align-items: center;
  padding: ${e=>e.$compact?"2px 6px":"4px 12px"};
  border-radius: 12px;
  font-size: ${e=>e.$compact?"11px":"13px"};
  background-color: ${e=>e.$variant==="success"?"green":e.$variant==="warning"?"orange":"red"};
  color: white;
`,i=a.span`
  font-weight: ${e=>e.$bold?700:400};
`;function p(){return n.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:12,padding:16},children:[n.jsxs("div",{style:{display:"flex",gap:8},children:[n.jsx(r,{$isExpanded:!0,children:"Expanded"}),n.jsx(r,{$isExpanded:!1,children:"Collapsed"})]}),n.jsxs("div",{style:{display:"flex",gap:8},children:[n.jsx(s,{$variant:"success",children:"OK"}),n.jsx(s,{$variant:"warning",$compact:!0,children:"Warn"}),n.jsx(s,{$variant:"error",$compact:!1,children:"Fail"})]}),n.jsx(i,{$bold:!0,children:"Bold text"}),n.jsx(i,{children:"Normal text"})]})}export{p as App,s as StatusBadge,r as TreeToggle};
