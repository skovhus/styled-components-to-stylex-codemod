import"./chunk-jRWAZmH_.js";import{c as e,m as t,p as n}from"./index-DIKafusi.js";t();var r=n();function i(e){let{disabled:t,...n}=e;return(0,r.jsx)(`button`,{disabled:t,...n})}var a=e(i)`
  appearance: none;
  border-width: 0;
  color: white;

  background-color: ${e=>e.color===`primary`?`blue`:`gray`};

  &:hover {
    background-color: ${e=>e.color===`primary`?`darkblue`:`darkgray`};
  }

  ${e=>e.disabled&&`background-color: grey; color: rgb(204, 204, 204); cursor: not-allowed;`}
`;function o(){return(0,r.jsxs)(`div`,{children:[(0,r.jsx)(a,{color:`primary`,children:`Primary`}),(0,r.jsx)(a,{color:`secondary`,children:`Secondary`}),(0,r.jsx)(a,{color:`primary`,disabled:!0,children:`Disabled Primary`})]})}export{o as App};