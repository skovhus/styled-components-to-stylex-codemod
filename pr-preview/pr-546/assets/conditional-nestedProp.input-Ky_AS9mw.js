import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-CU8qmYyO.js";t();var r=e(),i=function(e){return e.admin=`admin`,e.user=`user`,e}({}),a=n.div`
  ${e=>e.user.role===`admin`?`
    color: red;
  `:``}
`;function o(){return(0,r.jsxs)(`div`,{children:[(0,r.jsx)(a,{user:{role:`admin`,name:`Ada`},children:`Admin`}),(0,r.jsx)(a,{user:{role:`user`,name:`Bob`},children:`User`})]})}export{o as App,a as Badge,i as Role};