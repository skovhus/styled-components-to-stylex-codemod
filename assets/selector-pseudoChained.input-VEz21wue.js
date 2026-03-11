import{j as o,c as d}from"./index-C5vlgZC2.js";const t=d.input`
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
`,r=d.input`
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
`,e=d.div`
  padding: 8px;
  &:not(:last-child) {
    border-bottom: 1px solid ${s=>s.theme.color.bgBorderSolid};
  }
`,i=()=>o.jsxs("div",{children:[o.jsx(t,{placeholder:"Focus me..."}),o.jsx(t,{disabled:!0,placeholder:"Disabled"}),o.jsx(r,{type:"checkbox"}),o.jsx(r,{type:"checkbox",disabled:!0}),o.jsx(e,{children:"Item 1"}),o.jsx(e,{children:"Item 2"}),o.jsx(e,{children:"Item 3 (no border)"})]});export{i as App};
