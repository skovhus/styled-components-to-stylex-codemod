import"./chunk-jRWAZmH_.js";import{f as e,p as t,s as n}from"./index-BepVIQOS.js";t();var r=e(),i=function(e){return e.admin=`admin`,e.user=`user`,e}({}),a=n.div`
  ${e=>e.user.role===i.admin?`
    color: red;
  `:``}
`;function o(){return(0,r.jsxs)(`div`,{children:[(0,r.jsx)(a,{user:{role:i.admin,name:`Ada`},children:`Admin`}),(0,r.jsx)(a,{user:{role:i.user,name:`Bob`},children:`User`})]})}export{o as App,a as Badge,i as Role};