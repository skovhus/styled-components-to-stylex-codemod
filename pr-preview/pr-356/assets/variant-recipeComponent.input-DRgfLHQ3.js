import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-BFw42tS8.js";e(t(),1);var i=n();function a(e){let{disabled:t,...n}=e;return(0,i.jsx)(`button`,{disabled:t,...n})}var o=r(a)`
  appearance: none;
  border-width: 0;
  color: white;

  background-color: ${e=>e.color===`primary`?`blue`:`gray`};

  &:hover {
    background-color: ${e=>e.color===`primary`?`darkblue`:`darkgray`};
  }

  ${e=>e.disabled&&`background-color: grey; color: rgb(204, 204, 204); cursor: not-allowed;`}
`;function s(){return(0,i.jsxs)(`div`,{children:[(0,i.jsx)(o,{color:`primary`,children:`Primary`}),(0,i.jsx)(o,{color:`secondary`,children:`Secondary`}),(0,i.jsx)(o,{color:`primary`,disabled:!0,children:`Disabled Primary`})]})}export{s as App};