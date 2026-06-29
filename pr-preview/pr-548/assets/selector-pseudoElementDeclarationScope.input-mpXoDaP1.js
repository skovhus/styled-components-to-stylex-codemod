import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-DQy262oc.js";import{E as n}from"./helpers-pJ_BkxMk.js";var r=e(),i=t.div`
  position: relative;
  padding: 16px;
  background: white;
  border-radius: 12px;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, #60a5fa, #f472b6);
    background-size: 200% 100%;
    background-position: 50% 0;
    pointer-events: none;
  }
`,a=t.div`
  position: relative;
  min-height: 48px;
  padding: 12px 16px;
  background: #f8fafc;

  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 32px;
    right: 0;
    height: 0;
    border-top: 1px solid #cbd5e1;
    pointer-events: none;
  }
`,o=t.div`
  position: relative;
  min-height: 48px;
  padding: 12px 16px;
  background: #ecfdf5;

  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 32px;
    right: 0;
    height: 0;
    border-top: ${n(`#16a34a`)};
    pointer-events: none;
  }
`,s=()=>(0,r.jsxs)(`div`,{style:{display:`grid`,gap:12,padding:16},children:[(0,r.jsx)(i,{children:`Framed card`}),(0,r.jsx)(a,{children:`Divider row`}),(0,r.jsx)(o,{children:`Helper divider row`})]});export{s as App};