import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-DRa1uduC.js";var n=e(),r=t.button`
  padding: 8px 16px;
  background-color: #bf4f74;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;

  &[disabled] {
    background-color: #ccc;
    color: #666;
    cursor: not-allowed;
  }
`,i=t.select`
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;

  &[disabled] {
    background-color: #f5f5f5;
    color: #999;
  }
`,a=t.textarea`
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;

  &[disabled] {
    background-color: #f5f5f5;
    color: #999;
  }
`,o=()=>(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`12px`,padding:`16px`},children:[(0,n.jsx)(r,{children:`Enabled`}),(0,n.jsx)(r,{disabled:!0,children:`Disabled`}),(0,n.jsx)(i,{children:(0,n.jsx)(`option`,{children:`Enabled`})}),(0,n.jsx)(i,{disabled:!0,children:(0,n.jsx)(`option`,{children:`Disabled`})}),(0,n.jsx)(a,{defaultValue:`Enabled`}),(0,n.jsx)(a,{disabled:!0,defaultValue:`Disabled`})]});export{o as App};