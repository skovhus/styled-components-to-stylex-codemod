import{j as e,s as d,c as l}from"./index-CQS6McHQ.js";const i=l.div`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  background-color: white;
  ${({$active:r,$completed:c})=>(r||c)&&d`
      border-color: #6366f1;
      background-color: #6366f1;
    `}
`,o=l.div`
  padding: 8px 16px;
  background-color: #6366f1;
  color: white;
  ${({$active:r,$completed:c})=>!(r||c)&&d`
      background-color: #e2e8f0;
      color: #64748b;
    `}
`,t=l.span`
  padding: 4px 8px;
  border-radius: 4px;
  background-color: #e2e8f0;
  ${({$visible:r,$primary:c,$accent:n})=>r&&(c||n)&&d`
      background-color: #6366f1;
      color: white;
    `}
`;function a(){return e.jsxs("div",{style:{display:"flex",gap:16,padding:20,alignItems:"center",flexWrap:"wrap"},children:[e.jsx(i,{children:"neither"}),e.jsx(i,{$active:!0,children:"active"}),e.jsx(i,{$completed:!0,children:"completed"}),e.jsx(i,{$active:!0,$completed:!0,children:"both"}),e.jsx(o,{children:"neither"}),e.jsx(o,{$active:!0,children:"active"}),e.jsx(o,{$completed:!0,children:"completed"}),e.jsx(t,{children:"hidden"}),e.jsx(t,{$visible:!0,children:"visible"}),e.jsx(t,{$visible:!0,$primary:!0,children:"primary"}),e.jsx(t,{$visible:!0,$accent:!0,children:"accent"})]})}export{a as App};
