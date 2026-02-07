import{j as o,d as r}from"./index-B4qiiF0X.js";const e=r.button`
  padding: 8px 16px;
  background: white;
  color: #333;
  border: 2px solid #ccc;
  border-radius: 4px;
  cursor: pointer;

  &:hover,
  &:focus {
    background: #BF4F74;
    color: white;
    border-color: #BF4F74;
  }

  &:active,
  &:focus-visible {
    outline: 2px solid #4F74BF;
    outline-offset: 2px;
  }
`,c=r.a`
  color: #333;
  text-decoration: none;

  &:hover,
  &:focus,
  &:active {
    color: #BF4F74;
    text-decoration: underline;
  }
`,t=r.input`
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;

  &:hover,
  &:focus {
    border-color: #BF4F74;
  }

  &::placeholder {
    color: #999;
  }
`,i=()=>o.jsxs("div",{children:[o.jsx(e,{children:"Hover or Focus Me"}),o.jsx(c,{href:"#",children:"Link"}),o.jsx(t,{placeholder:"Type here..."})]});export{i as App};
