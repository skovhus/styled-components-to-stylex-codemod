import{j as o,d as n}from"./index-6IzoEOg4.js";function d(r){const{disabled:a,...c}=r;return o.jsx("button",{disabled:a,...c})}const e=n(d)`
  appearance: none;
  border-width: 0;
  color: white;

  background-color: ${r=>r.color==="primary"?"blue":"gray"};

  &:hover {
    background-color: ${r=>r.color==="primary"?"darkblue":"darkgray"};
  }

  ${r=>r.disabled&&"background-color: grey; color: rgb(204, 204, 204); cursor: not-allowed;"}
`;function t(){return o.jsxs("div",{children:[o.jsx(e,{color:"primary",children:"Primary"}),o.jsx(e,{color:"secondary",children:"Secondary"}),o.jsx(e,{color:"primary",disabled:!0,children:"Disabled Primary"})]})}export{t as App};
