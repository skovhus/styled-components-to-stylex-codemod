import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t}from"./index-B6KXr7s5.js";import{k as n}from"./helpers-Da6Z7yrn.js";var r=e(),i=t.div`
  line-height: 1rem;
  ${({$oneLine:e})=>n(e?1:2)};
`,a=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`8px`,padding:`16px`},children:[(0,r.jsx)(i,{$oneLine:!0,children:`One line truncated`}),(0,r.jsx)(i,{$oneLine:!1,children:`Two line truncated text that should wrap to a second line before being cut off`})]});export{a as App};