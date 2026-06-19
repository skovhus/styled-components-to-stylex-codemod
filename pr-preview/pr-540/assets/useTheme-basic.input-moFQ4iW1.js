import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{f as t,m as n,u as r}from"./index-HYhGmoqQ.js";import{a as i}from"./helpers-LMUvyceY.js";n();var a=e();function o(e){let n=t().color.bgBase;return(0,a.jsx)(s,{style:{backgroundColor:n}})}var s=r.div`
  width: auto;
  height: 10px;
  background: ${i(`bgBase`)};
  box-shadow: 0 2px 4px ${e=>e.theme.color.primaryColor};
  border-radius: 8px;
  display: flex;
  border: 1px solid ${i(`bgSub`)};
  min-width: 300px;
  padding: 12px;
`,c=r.div`
  color: ${e=>e.theme.color.labelBase??`black`};
`,l=()=>(0,a.jsxs)(`div`,{children:[(0,a.jsx)(o,{}),(0,a.jsx)(c,{children:`Fallback test`})]});export{l as App,o as Input};