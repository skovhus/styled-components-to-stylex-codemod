import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{d as t,l as n,p as r}from"./index-Cfhwb6tZ.js";import{a as i}from"./helpers-CUbu-01a.js";r();var a=e();function o(e){let n=t().color.bgBase;return(0,a.jsx)(s,{style:{backgroundColor:n}})}var s=n.div`
  width: auto;
  height: 10px;
  background: ${i(`bgBase`)};
  box-shadow: 0 2px 4px ${e=>e.theme.color.primaryColor};
  border-radius: 8px;
  display: flex;
  border: 1px solid ${i(`bgSub`)};
  min-width: 300px;
  padding: 12px;
`,c=n.div`
  color: ${e=>e.theme.color.labelBase??`black`};
`,l=()=>(0,a.jsxs)(`div`,{children:[(0,a.jsx)(o,{}),(0,a.jsx)(c,{children:`Fallback test`})]});export{l as App,o as Input};