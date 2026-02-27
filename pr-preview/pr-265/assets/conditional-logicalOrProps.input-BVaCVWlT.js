import{j as e,s as c,c as d}from"./index-DwP4wERD.js";const r=d.div`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  background-color: white;
  ${({$active:t,$completed:o})=>(t||o)&&c`
      border-color: #6366f1;
      background-color: #6366f1;
    `}
`;function s(){return e.jsxs("div",{style:{display:"flex",gap:16,padding:20,alignItems:"center"},children:[e.jsx(r,{children:"neither"}),e.jsx(r,{$active:!0,children:"active"}),e.jsx(r,{$completed:!0,children:"completed"}),e.jsx(r,{$active:!0,$completed:!0,children:"both"})]})}export{s as App};
