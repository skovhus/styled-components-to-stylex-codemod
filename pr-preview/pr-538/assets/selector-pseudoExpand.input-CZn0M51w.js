import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-D5hBhQAk.js";import{g as r}from"./helpers-CpE6KB6A.js";t();var i=e(),a=n.button`
  padding: 8px 16px;
  background-color: #f0f0f0;
  color: #333;

  &:${r} {
    background-color: #e0e0e0;
    color: #111;
  }
`,o=n.button`
  padding: 8px 16px;
  background-color: #f0f0f0;
  color: #333;

  &:not(:disabled):${r} {
    background-color: #d0d0ff;
    color: #000;
  }
`;function s(){return(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,i.jsx)(a,{children:`Default`}),(0,i.jsx)(a,{children:`Hover me`}),(0,i.jsx)(o,{children:`Enabled`}),(0,i.jsx)(o,{disabled:!0,children:`Disabled`})]})}export{s as App};