import"./chunk-jRWAZmH_.js";import{c as e,m as t,p as n}from"./index-9A_WyPJK.js";t();var r=n(),i=function(e){return e.admin=`admin`,e.user=`user`,e}({}),a=e.div`
  ${e=>e.user.role===i.admin?`
    color: red;
  `:``}
`;function o(){return(0,r.jsxs)(`div`,{children:[(0,r.jsx)(a,{user:{role:i.admin,name:`Ada`},children:`Admin`}),(0,r.jsx)(a,{user:{role:i.user,name:`Bob`},children:`User`})]})}export{o as App,a as Badge,i as Role};