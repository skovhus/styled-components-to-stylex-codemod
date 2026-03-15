import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-CyUUxAP6.js";var n=e(),r=t.input`
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;

  &:focus:not(:disabled) {
    border-color: #bf4f74;
    outline: none;
  }

  &:hover:not(:disabled):not(:focus) {
    border-color: #999;
  }

  &:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }
`,i=t.input`
  width: 20px;
  height: 20px;
  cursor: pointer;

  &:checked:not(:disabled) {
    accent-color: #bf4f74;
  }

  &:focus:not(:disabled) {
    outline: 2px solid #4f74bf;
    outline-offset: 2px;
  }
`,a=t.div`
  padding: 8px;
  &:not(:last-child) {
    border-bottom: 1px solid ${e=>e.theme.color.bgBorderSolid};
  }
`,o=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsx)(r,{placeholder:`Focus me...`}),(0,n.jsx)(r,{disabled:!0,placeholder:`Disabled`}),(0,n.jsx)(i,{type:`checkbox`}),(0,n.jsx)(i,{type:`checkbox`,disabled:!0}),(0,n.jsx)(a,{children:`Item 1`}),(0,n.jsx)(a,{children:`Item 2`}),(0,n.jsx)(a,{children:`Item 3 (no border)`})]});export{o as App};