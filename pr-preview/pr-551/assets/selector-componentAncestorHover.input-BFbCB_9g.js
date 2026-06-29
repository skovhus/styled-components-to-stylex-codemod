import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-CJf-ThBW.js";var n=e(),r=t.button`
  opacity: 0;
  transform: translateY(2px);
  transition:
    opacity 0.2s,
    transform 0.2s;
`,i=t.div`
  padding: 16px;
  background: #f1f5f9;
  color: #334155;

  &:hover ${r} {
    opacity: 1;
    transform: translateY(0);
  }
`,a=()=>(0,n.jsxs)(i,{children:[(0,n.jsx)(`span`,{children:`Hover card`}),(0,n.jsx)(r,{children:`Action`})]});export{a as App};