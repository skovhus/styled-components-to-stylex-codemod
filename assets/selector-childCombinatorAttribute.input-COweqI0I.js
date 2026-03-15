import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-Dda2rlA_.js";var n=e(),r=t.button`
  padding: 8px 16px;
  background: #bf4f74;
  color: white;
  border: none;
  border-radius: 4px;
`,i=t.div`
  display: flex;
  gap: 8px;
  padding: 16px;
  background: #f0f0f0;

  & > button[disabled] {
    pointer-events: none;
    opacity: 0.5;
  }
`,a=()=>(0,n.jsx)(`div`,{style:{display:`flex`,gap:`16px`,padding:`16px`},children:(0,n.jsxs)(i,{children:[(0,n.jsx)(r,{children:`Enabled`}),(0,n.jsx)(r,{disabled:!0,children:`Disabled`})]})});export{a as App};