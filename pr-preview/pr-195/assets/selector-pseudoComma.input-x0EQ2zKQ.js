import{j as o,a as r}from"./index-LC5oshb-.js";const e=r.button`
  padding: 8px 16px;
  background: white;
  color: #333;
  border: 2px solid #ccc;
  border-radius: 4px;
  cursor: pointer;

  &:hover,
  &:focus {
    background: #bf4f74;
    color: white;
    border-color: #bf4f74;
  }

  &:active,
  &:focus-visible {
    outline: 2px solid #4f74bf;
    outline-offset: 2px;
  }
`,c=r.a`
  color: #333;
  text-decoration: none;

  &:hover,
  &:focus,
  &:active {
    color: #bf4f74;
    text-decoration: underline;
  }
`,t=r.input`
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;

  &:hover,
  &:focus {
    border-color: #bf4f74;
  }

  &::placeholder {
    color: #999;
  }
`,n=()=>o.jsxs("div",{children:[o.jsx(e,{children:"Hover or Focus Me"}),o.jsx(c,{href:"#",children:"Link"}),o.jsx(t,{placeholder:"Type here..."})]});export{n as App};
