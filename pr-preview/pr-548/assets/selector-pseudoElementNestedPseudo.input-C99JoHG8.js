import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-BCxlhZuN.js";var n=e(),r=t.div`
  position: relative;
  height: 24px;
  cursor: ns-resize;

  &::after {
    content: "";
    position: absolute;
    left: 8px;
    right: 8px;
    top: 10px;
    height: 4px;
    border-radius: 999px;
    background-color: #cbd5e1;
  }

  &:hover::after {
    background-color: #64748b;
  }
`,i=t.div`
  position: relative;
  padding: 16px;
  border-radius: 8px;
  background-color: white;

  &::before {
    content: "";
    position: absolute;
    inset: -1px;
    border-radius: 9px;
    pointer-events: none;
    background-image: linear-gradient(to bottom, #cbd5e1, #e2e8f0);
    transition: background-image 120ms ease-out;
  }

  &:focus-within::before {
    background-image: linear-gradient(to bottom, #6366f1, #a5b4fc);
  }
`,a=()=>(0,n.jsxs)(`div`,{style:{display:`grid`,gap:12,padding:16,width:260},children:[(0,n.jsx)(r,{}),(0,n.jsx)(i,{children:(0,n.jsx)(`button`,{type:`button`,children:`Focus panel`})})]});export{a as App};