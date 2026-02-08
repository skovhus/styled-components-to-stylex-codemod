import{j as o,a as d}from"./index-BkrtNbR-.js";const e=d.button`
  appearance: none;
  border-width: 0;

  background-color: ${r=>r.color==="primary"?"blue":"gray"};
  color: white;

  &:hover {
    background-color: ${r=>r.color==="primary"?"darkblue":"darkgray"};
  }

  font-size: ${r=>r.size==="medium"?"1.2rem":"1rem"};
  padding: ${r=>r.size==="medium"?"8px 16px":"4px 8px"};

  ${r=>r.disabled?"background-color: grey; color: rgb(204, 204, 204); cursor: not-allowed;":""}
`,i=d.a`
  text-decoration: none;
  color: ${r=>r.color==="primary"?"red":"green"};

  &:hover {
    text-decoration: underline;
    color: ${r=>r.color==="primary"?"darkred":"darkgreen"};
  }

  ${r=>r.disabled&&"color: grey; cursor: not-allowed;"}
`;function a(){return o.jsxs("div",{children:[o.jsx(e,{color:"primary",size:"medium",children:"Primary"}),o.jsx(e,{color:"secondary",children:"Secondary"}),o.jsx(e,{color:"primary",size:"medium",disabled:!0,children:"Disabled"}),o.jsx(i,{color:"primary",href:"#",children:"Primary Link"}),o.jsx(i,{color:"secondary",href:"#",children:"Secondary Link"})]})}export{a as App};
