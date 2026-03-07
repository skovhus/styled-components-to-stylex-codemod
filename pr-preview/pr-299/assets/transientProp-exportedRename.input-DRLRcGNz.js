import{j as r,c as i,s as t}from"./index-CpYoUbLe.js";function c(e){return r.jsx("span",{className:e.className,style:e.style,children:e.children})}function x(e){const{$isExpanded:l,...o}=e;return r.jsx(c,{...o,children:r.jsx("svg",{viewBox:"0 0 16 16",children:r.jsx("path",{d:l?"M3 10L8 5L13 10":"M3 6L8 11L13 6"})})})}const s=i(x)`
  transition: transform 0.15s ease;
  cursor: pointer;
  padding: 4px;
  ${e=>e.$isExpanded&&t`
      transform: rotate(180deg);
    `}
`,n=i.div`
  display: inline-flex;
  align-items: center;
  padding: ${e=>e.$compact?"2px 6px":"4px 12px"};
  border-radius: 12px;
  font-size: ${e=>e.$compact?"11px":"13px"};
  background-color: ${e=>e.$variant==="success"?"green":e.$variant==="warning"?"orange":"red"};
  color: white;
`,d=i.span`
  font-weight: ${e=>e.$bold?700:400};
`,p=i.div`
  background-color: ${e=>e.$color};
  color: ${e=>e.color};
  padding: 4px 8px;
  border-radius: 4px;
`,a=i.div`
  border: 2px solid ${e=>e.$highlighted?"gold":"gray"};
  padding: 4px 8px;
  border-radius: 4px;
`;function h(){return r.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:12,padding:16},children:[r.jsxs("div",{style:{display:"flex",gap:8},children:[r.jsx(s,{$isExpanded:!0,children:"Expanded"}),r.jsx(s,{$isExpanded:!1,children:"Collapsed"})]}),r.jsxs("div",{style:{display:"flex",gap:8},children:[r.jsx(n,{$variant:"success",children:"OK"}),r.jsx(n,{$variant:"warning",$compact:!0,children:"Warn"}),r.jsx(n,{$variant:"error",$compact:!1,children:"Fail"})]}),r.jsx(d,{$bold:!0,children:"Bold text"}),r.jsx(d,{children:"Normal text"}),r.jsx(p,{$color:"blue",color:"white",children:"Collision kept"}),r.jsx(a,{$highlighted:!0,children:"Highlighted"}),r.jsx(a,{children:"Normal"})]})}export{h as App,p as ColorChip,a as SpecifierTag,n as StatusBadge,s as TreeToggle};
