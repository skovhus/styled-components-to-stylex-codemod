import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-DRa1uduC.js";e(t(),1);var i=n(),a=r.button`
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
`,o=r.a`
  text-decoration: none;
  color: ${e=>e.color===`primary`?`red`:`green`};

  &:hover {
    text-decoration: underline;
    color: ${e=>e.color===`primary`?`darkred`:`darkgreen`};
  }

  ${e=>e.disabled&&`color: grey; cursor: not-allowed;`}
`;function s(){return(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{color:`primary`,size:`medium`,children:`Primary`}),(0,i.jsx)(a,{color:`secondary`,children:`Secondary`}),(0,i.jsx)(a,{color:`primary`,size:`medium`,disabled:!0,children:`Disabled`}),(0,i.jsx)(o,{color:`primary`,href:`#`,children:`Primary Link`}),(0,i.jsx)(o,{color:`secondary`,href:`#`,children:`Secondary Link`})]})}export{s as App};