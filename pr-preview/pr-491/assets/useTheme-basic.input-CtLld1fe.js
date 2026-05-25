import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,o as n,p as r}from"./index-wUYk4nIo.js";import{a as i}from"./helpers-CRt0g4ns.js";r();var a=e();function o(e){let t=n().color.bgBase;return(0,a.jsx)(s,{style:{backgroundColor:t}})}var s=t.div`
  width: auto;
  height: 10px;
  background: ${i(`bgBase`)};
  box-shadow: 0 2px 4px ${e=>e.theme.color.primaryColor};
  border-radius: 8px;
  display: flex;
  border: 1px solid ${i(`bgSub`)};
  min-width: 300px;
  padding: 12px;
`,c=t.div`
  color: ${e=>e.theme.color.labelBase??`black`};
`,l=()=>(0,a.jsxs)(`div`,{children:[(0,a.jsx)(o,{}),(0,a.jsx)(c,{children:`Fallback test`})]});export{l as App,o as Input};