import{j as r,a as n}from"./index-CYapH9Fo.js";const e=n.div`
  padding: 16px;
  border: ${o=>o.bordered?"1px solid gray":"none"};
  background-color: ${o=>o.bg||"white"};
`,t=n.input`
  padding: 8px;
  &:focus {
    outline: 2px solid blue;
  }
`;function d(){return r.jsx(e,{bordered:!0,bg:"lightgray",children:r.jsx(t,{onChange:o=>console.log(o.target.value)})})}function p(){return r.jsx(d,{})}export{p as App,e as Box,d as Form,t as Input};
