import{j as d,a as e}from"./index-DqIJeDJN.js";const n=e.button`
  padding: 8px 16px;
  background: #bf4f74;
  color: white;
  border: none;
  border-radius: 4px;
`,i=e.div`
  display: flex;
  gap: 8px;
  padding: 16px;
  background: #f0f0f0;

  & > button[disabled] {
    pointer-events: none;
    opacity: 0.5;
  }
`,p=()=>d.jsx("div",{style:{display:"flex",gap:"16px",padding:"16px"},children:d.jsxs(i,{children:[d.jsx(n,{children:"Enabled"}),d.jsx(n,{disabled:!0,children:"Disabled"})]})});export{p as App};
