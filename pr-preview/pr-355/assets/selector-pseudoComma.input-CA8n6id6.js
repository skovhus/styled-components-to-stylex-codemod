import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-BEHMEpNn.js";var n=e(),r=t.button`
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
`,i=t.a`
  color: #333;
  text-decoration: none;

  &:hover,
  &:focus,
  &:active {
    color: #bf4f74;
    text-decoration: underline;
  }
`,a=t.input`
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
`,o=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsx)(r,{children:`Hover or Focus Me`}),(0,n.jsx)(i,{href:`#`,children:`Link`}),(0,n.jsx)(a,{placeholder:`Type here...`})]});export{o as App};