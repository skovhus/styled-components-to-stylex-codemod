import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-D0Zr0IqL.js";n();var r=e(),i=function(e){return e.admin=`admin`,e.user=`user`,e}({}),a=t.div`
  ${e=>e.user.role===i.admin?`
    color: red;
  `:``}
`;function o(){return(0,r.jsxs)(`div`,{children:[(0,r.jsx)(a,{user:{role:i.admin,name:`Ada`},children:`Admin`}),(0,r.jsx)(a,{user:{role:i.user,name:`Bob`},children:`User`})]})}export{o as App,a as Badge,i as Role};