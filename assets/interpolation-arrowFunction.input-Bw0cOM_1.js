import{j as i,a as n}from"./index-BrCm46fE.js";const d=n.div`
  background: ${r=>r.$direction==="horizontal"?"linear-gradient(90deg, #bf4f74, #3498db)":"linear-gradient(180deg, #bf4f74, #3498db)"};
  padding: 24px;
`,t=n.div`
  padding: 12px 16px;
  border-bottom: ${r=>r.$isActive?"2px solid #bf4f74":"2px solid transparent"};
  cursor: pointer;
`,o=()=>i.jsxs("div",{children:[i.jsx(d,{$direction:"horizontal",children:"Horizontal Gradient"}),i.jsx(t,{$isActive:!0,children:"Active Tab"}),i.jsx(t,{children:"Inactive Tab"})]});export{o as App};
