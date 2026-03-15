import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-DRa1uduC.js";e(t(),1);var i=n(),a=function(e){return e.admin=`admin`,e.user=`user`,e}({}),o=r.div`
  ${e=>e.user.role===a.admin?`
    color: red;
  `:``}
`;function s(){return(0,i.jsxs)(`div`,{children:[(0,i.jsx)(o,{user:{role:a.admin,name:`Ada`},children:`Admin`}),(0,i.jsx)(o,{user:{role:a.user,name:`Bob`},children:`User`})]})}export{s as App,o as Badge,a as Role};