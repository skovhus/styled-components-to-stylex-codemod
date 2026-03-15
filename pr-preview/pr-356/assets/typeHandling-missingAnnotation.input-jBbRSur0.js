import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-BFw42tS8.js";e(t(),1);var i=n(),a=r.div`
  padding: 16px;
  border: ${e=>e.bordered?`1px solid gray`:`none`};
  background-color: ${e=>e.bg||`white`};
`,o=r.input`
  padding: 8px;
  &:focus {
    outline: 2px solid blue;
  }
`;function s(){return(0,i.jsx)(a,{bordered:!0,bg:`lightgray`,children:(0,i.jsx)(o,{onChange:e=>console.log(e.target.value)})})}function c(){return(0,i.jsx)(s,{})}export{c as App,a as Box,s as Form,o as Input};