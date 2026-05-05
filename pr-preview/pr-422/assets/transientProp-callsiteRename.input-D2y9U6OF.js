import"./chunk-jRWAZmH_.js";import{f as e,p as t,s as n}from"./index-BLc84ifp.js";t();var r=e();function i(e){let{children:t,className:n,style:i,...a}=e;return(0,r.jsx)(`section`,{...a,className:n,style:i,children:t})}var a=n(i)`
  display: grid;
  grid-template-columns: repeat(${e=>e.$columnCount??1}, minmax(0, 1fr));
  top: ${e=>e.$floatingOffset??0}px;
  padding: ${e=>e.$asCard?`16px`:`8px`};
  background-color: #eef2ff;
`,o=()=>(0,r.jsx)(`div`,{style:{padding:12},children:(0,r.jsx)(a,{$asCard:!0,$columnCount:3,$floatingOffset:24,role:`region`,children:`Renamed transient props`})});export{o as App};