import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-DBtJfnzk.js";t();var r=e(),i=n.button`
  appearance: none;
  border-width: 0;

  background-color: ${e=>e.color===`primary`?`blue`:`gray`};
  color: white;

  &:hover {
    background-color: ${e=>e.color===`primary`?`darkblue`:`darkgray`};
  }

  font-size: ${e=>e.size===`medium`?`1.2rem`:`1rem`};
  padding: ${e=>e.size===`medium`?`8px 16px`:`4px 8px`};

  ${e=>e.disabled?`background-color: grey; color: rgb(204, 204, 204); cursor: not-allowed;`:``}
`,a=n.a`
  text-decoration: none;
  color: ${e=>e.color===`primary`?`red`:`green`};

  &:hover {
    text-decoration: underline;
    color: ${e=>e.color===`primary`?`darkred`:`darkgreen`};
  }

  ${e=>e.disabled&&`color: grey; cursor: not-allowed;`}
`;function o(){return(0,r.jsxs)(`div`,{children:[(0,r.jsx)(i,{color:`primary`,size:`medium`,children:`Primary`}),(0,r.jsx)(i,{color:`secondary`,children:`Secondary`}),(0,r.jsx)(i,{color:`primary`,size:`medium`,disabled:!0,children:`Disabled`}),(0,r.jsx)(a,{color:`primary`,href:`#`,children:`Primary Link`}),(0,r.jsx)(a,{color:`secondary`,href:`#`,children:`Secondary Link`})]})}export{o as App};