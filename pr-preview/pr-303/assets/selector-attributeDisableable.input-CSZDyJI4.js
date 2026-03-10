import{j as d,c as e}from"./index-OgVBKUYB.js";const o=e.button`
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
`,r=e.select`
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;

  &[disabled] {
    background-color: #f5f5f5;
    color: #999;
  }
`,l=e.textarea`
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;

  &[disabled] {
    background-color: #f5f5f5;
    color: #999;
  }
`,s=()=>d.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"12px",padding:"16px"},children:[d.jsx(o,{children:"Enabled"}),d.jsx(o,{disabled:!0,children:"Disabled"}),d.jsx(r,{children:d.jsx("option",{children:"Enabled"})}),d.jsx(r,{disabled:!0,children:d.jsx("option",{children:"Disabled"})}),d.jsx(l,{defaultValue:"Enabled"}),d.jsx(l,{disabled:!0,defaultValue:"Disabled"})]});export{s as App};
