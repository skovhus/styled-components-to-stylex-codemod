import{j as o,c as n}from"./index-FP_Cx-M0.js";function d(r){const{disabled:e,...a}=r;return o.jsx("button",{disabled:e,...a})}const c=n(d)`
  appearance: none;
  border-width: 0;
  color: white;

  background-color: ${r=>r.color==="primary"?"blue":"gray"};

  &:hover {
    background-color: ${r=>r.color==="primary"?"darkblue":"darkgray"};
  }

  ${r=>r.disabled&&"background-color: grey; color: rgb(204, 204, 204); cursor: not-allowed;"}
`;function t(){return o.jsxs("div",{children:[o.jsx(c,{color:"primary",children:"Primary"}),o.jsx(c,{color:"secondary",children:"Secondary"}),o.jsx(c,{color:"primary",disabled:!0,children:"Disabled Primary"})]})}export{t as App};
