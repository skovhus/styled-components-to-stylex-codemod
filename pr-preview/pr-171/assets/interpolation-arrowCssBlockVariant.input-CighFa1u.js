import{j as s,a as t}from"./index-DUtEfIHX.js";const e=t.div`
  border-radius: 50%;
  background-color: green;

  ${i=>i.size==="tiny"&&`
    width: 7px;
    height: 7px;
  `}

  ${i=>i.size==="small"&&`
    width: 10px;
    height: 10px;
  `}

  ${i=>i.size==="medium"&&`
    width: 14px;
    height: 14px;
  `}
`,d=()=>s.jsxs("div",{children:[s.jsx(e,{size:"tiny"}),s.jsx(e,{size:"small"}),s.jsx(e,{size:"medium"})]});export{d as App};
