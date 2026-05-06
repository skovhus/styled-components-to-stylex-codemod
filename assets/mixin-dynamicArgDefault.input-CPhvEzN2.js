import{c as e,p as t}from"./index-BoKTTZFH.js";import{D as n}from"./helpers-C7OXbuss.js";var r=t(),i=e.div`
  line-height: 1rem;
  ${({$oneLine:e=!0})=>n(e?1:2)};
`,a=e.div`
  line-height: 1rem;
  ${({$oneLine:e=!0})=>n(e?1:2)};
  color: ${({$oneLine:e})=>e===void 0?`purple`:`teal`};
`,o=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`8px`,padding:`16px`},children:[(0,r.jsx)(i,{children:`Default one-line (safe to hoist default)`}),(0,r.jsx)(i,{$oneLine:!1,children:`Two-line truncated`}),(0,r.jsx)(a,{children:`Default one-line and purple`}),(0,r.jsx)(a,{$oneLine:!1,children:`Two-line and teal`})]});export{o as App};