import{j as o,a as n}from"./index-AiBWoSQp.js";function d(r){const{disabled:e,...c}=r;return o.jsx("button",{disabled:e,...c})}const a=n(d)`
  appearance: none;
  border-width: 0;
  color: white;

  background-color: ${r=>r.color==="primary"?"blue":"gray"};

  &:hover {
    background-color: ${r=>r.color==="primary"?"darkblue":"darkgray"};
  }

  ${r=>r.disabled&&"background-color: grey; color: rgb(204, 204, 204); cursor: not-allowed;"}
`;function t(){return o.jsxs("div",{children:[o.jsx(a,{color:"primary",children:"Primary"}),o.jsx(a,{color:"secondary",children:"Secondary"}),o.jsx(a,{color:"primary",disabled:!0,children:"Disabled Primary"})]})}export{t as App};
