import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-BXL_OpXW.js";t();var r=e(),i=e=>{let{gap:t,shrink:n,style:i,...a}=e;return(0,r.jsx)(`div`,{...a,style:{gap:t,flexShrink:n,...i}})},a=n.input`
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
`,o=n.input`
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
`,s=n.div`
  padding: 8px;
  &:not(:last-child) {
    border-bottom: 1px solid ${e=>e.theme.color.bgBorderSolid};
  }
`,c=n(i).attrs({gap:6,shrink:0})`
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 10px 0 6px;

  &:not(:last-child) {
    border-bottom: 1px solid #cbd5e1;
  }
`,l=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(a,{placeholder:`Focus me...`}),(0,r.jsx)(a,{disabled:!0,placeholder:`Disabled`}),(0,r.jsx)(o,{type:`checkbox`}),(0,r.jsx)(o,{type:`checkbox`,disabled:!0}),(0,r.jsx)(s,{children:`Item 1`}),(0,r.jsx)(s,{children:`Item 2`}),(0,r.jsx)(s,{children:`Item 3 (no border)`}),(0,r.jsx)(c,{children:`Row 1`}),(0,r.jsx)(c,{children:`Row 2`})]});export{l as App};