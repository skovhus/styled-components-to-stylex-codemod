import{j as o,a as s}from"./index-CGfeZ_F8.js";const e=s.input`
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
`,d=s.input`
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
`,c=()=>o.jsxs("div",{children:[o.jsx(e,{placeholder:"Focus me..."}),o.jsx(e,{disabled:!0,placeholder:"Disabled"}),o.jsx(d,{type:"checkbox"}),o.jsx(d,{type:"checkbox",disabled:!0})]});export{c as App};
