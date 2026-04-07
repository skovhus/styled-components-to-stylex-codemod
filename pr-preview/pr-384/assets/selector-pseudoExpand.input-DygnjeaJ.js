import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-7qMBd3gE.js";import{m as i}from"./helpers-Ib6k4O9E.js";e(t(),1);var a=n(),o=r.button`
  padding: 8px 16px;
  background-color: #f0f0f0;
  color: #333;

  &:${i} {
    background-color: #e0e0e0;
    color: #111;
  }
`,s=r.button`
  padding: 8px 16px;
  background-color: #f0f0f0;
  color: #333;

  &:not(:disabled):${i} {
    background-color: #d0d0ff;
    color: #000;
  }
`;function c(){return(0,a.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,a.jsx)(o,{children:`Default`}),(0,a.jsx)(o,{children:`Hover me`}),(0,a.jsx)(s,{children:`Enabled`}),(0,a.jsx)(s,{disabled:!0,children:`Disabled`})]})}export{c as App};