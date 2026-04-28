import"./chunk-jRWAZmH_.js";import{f as e,p as t,s as n}from"./index-jXBjwzzU.js";t();var r=e(),i=n.div`
  padding: 16px;
  border: ${e=>e.bordered?`1px solid gray`:`none`};
  background-color: ${e=>e.bg||`white`};
`,a=n.input`
  padding: 8px;
  &:focus {
    outline: 2px solid blue;
  }
`;function o(){return(0,r.jsx)(i,{bordered:!0,bg:`lightgray`,children:(0,r.jsx)(a,{onChange:e=>console.log(e.target.value)})})}function s(){return(0,r.jsx)(o,{})}export{s as App,i as Box,o as Form,a as Input};