import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-BO-NS-aI.js";t();var r=e();function i(e){let{children:t,className:n,style:i,...a}=e;return(0,r.jsx)(`section`,{...a,className:n,style:i,children:t})}var a=n(i)`
  display: grid;
  grid-template-columns: repeat(${e=>e.$columnCount??1}, minmax(0, 1fr));
  top: ${e=>e.$floatingOffset??0}px;
  padding: ${e=>e.$asCard?`16px`:`8px`};
  background-color: #eef2ff;
`,o=n(a).attrs({$asCard:!0,$floatingOffset:4})`
  border-radius: 8px;
`,s={Panel:a,Legend:{Grid:a}},c=Math.random()>.5?a:o,l=()=>(0,r.jsxs)(`div`,{style:{padding:12},children:[(0,r.jsx)(a,{$asCard:!0,$columnCount:3,$floatingOffset:24,role:`region`,children:`Renamed transient props`}),(0,r.jsx)(s.Panel,{$asCard:!0,$columnCount:2,children:`Member transient prop`}),(0,r.jsx)(s.Legend.Grid,{$columnCount:4,children:`Nested member transient prop`}),(0,r.jsx)(o,{$columnCount:1,children:`Attrs transient defaults`}),(0,r.jsx)(c,{$asCard:!0,$floatingOffset:12,children:`Alias transient prop`})]});export{l as App};