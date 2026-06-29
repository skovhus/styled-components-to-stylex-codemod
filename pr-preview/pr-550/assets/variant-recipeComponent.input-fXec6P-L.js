import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-xV7lcCUQ.js";t();var r=e();function i(e){let{disabled:t,...n}=e;return(0,r.jsx)(`button`,{disabled:t,...n})}var a=n(i)`
  appearance: none;
  border-width: 0;
  color: white;

  background-color: ${e=>e.color===`primary`?`blue`:`gray`};

  &:hover {
    background-color: ${e=>e.color===`primary`?`darkblue`:`darkgray`};
  }

  ${e=>e.disabled&&`background-color: grey; color: rgb(204, 204, 204); cursor: not-allowed;`}
`;function o(){return(0,r.jsxs)(`div`,{children:[(0,r.jsx)(a,{color:`primary`,children:`Primary`}),(0,r.jsx)(a,{color:`secondary`,children:`Secondary`}),(0,r.jsx)(a,{color:`primary`,disabled:!0,children:`Disabled Primary`})]})}export{o as App};