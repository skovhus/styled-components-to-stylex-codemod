import"./chunk-jRWAZmH_.js";import{c as e,m as t,p as n}from"./index-DDUSP3M2.js";import{h as r}from"./helpers-VW8TQnWM.js";t();var i=n(),a=e.button`
  padding: 8px 16px;
  background-color: #f0f0f0;
  color: #333;

  &:${r} {
    background-color: #e0e0e0;
    color: #111;
  }
`,o=e.button`
  padding: 8px 16px;
  background-color: #f0f0f0;
  color: #333;

  &:not(:disabled):${r} {
    background-color: #d0d0ff;
    color: #000;
  }
`;function s(){return(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,i.jsx)(a,{children:`Default`}),(0,i.jsx)(a,{children:`Hover me`}),(0,i.jsx)(o,{children:`Enabled`}),(0,i.jsx)(o,{disabled:!0,children:`Disabled`})]})}export{s as App};