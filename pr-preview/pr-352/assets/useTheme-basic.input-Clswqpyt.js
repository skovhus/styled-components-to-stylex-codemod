import{j as r,K as a,c as e}from"./index-BYrzxWnm.js";import{c as s}from"./helpers-BfeCNb0l.js";function c(o){const t=a().color.bgBase;return r.jsx(l,{style:{backgroundColor:t}})}const l=e.div`
  width: auto;
  height: 10px;
  background: ${s("bgBase")};
  box-shadow: 0 2px 4px ${o=>o.theme.color.primaryColor};
  border-radius: 8px;
  display: flex;
  border: 1px solid ${s("bgSub")};
  min-width: 300px;
  padding: 12px;
`,p=e.div`
  color: ${o=>o.theme.color.labelBase??"black"};
`,n=()=>r.jsxs("div",{children:[r.jsx(c,{}),r.jsx(p,{children:"Fallback test"})]});export{n as App,c as Input};
