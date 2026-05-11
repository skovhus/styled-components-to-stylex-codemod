import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-mm14UeUF.js";n();var r=e(),i=t.div`
  padding: 16px;
  border: ${e=>e.bordered?`1px solid gray`:`none`};
  background-color: ${e=>e.bg||`white`};
`,a=t.input`
  padding: 8px;
  &:focus {
    outline: 2px solid blue;
  }
`;function o(){return(0,r.jsx)(i,{bordered:!0,bg:`lightgray`,children:(0,r.jsx)(a,{onChange:e=>console.log(e.target.value)})})}function s(){return(0,r.jsx)(o,{})}export{s as App,i as Box,o as Form,a as Input};