import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t,p as n}from"./index-ZLcLy-dV.js";import{g as r}from"./helpers-Dso_q1Nq.js";n();var i=e(),a=t.button`
  padding: 8px 16px;
  background-color: #f0f0f0;
  color: #333;

  &:${r} {
    background-color: #e0e0e0;
    color: #111;
  }
`,o=t.button`
  padding: 8px 16px;
  background-color: #f0f0f0;
  color: #333;

  &:not(:disabled):${r} {
    background-color: #d0d0ff;
    color: #000;
  }
`;function s(){return(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,i.jsx)(a,{children:`Default`}),(0,i.jsx)(a,{children:`Hover me`}),(0,i.jsx)(o,{children:`Enabled`}),(0,i.jsx)(o,{disabled:!0,children:`Disabled`})]})}export{s as App};