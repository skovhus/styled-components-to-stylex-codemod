import{j as e,a as s}from"./index-DeUnwoPj.js";var a=(r=>(r.admin="admin",r.user="user",r))(a||{});const n=s.div`
  ${r=>r.user.role==="admin"?`
    color: red;
  `:""}
`;function i(){return e.jsxs("div",{children:[e.jsx(n,{user:{role:"admin",name:"Ada"},children:"Admin"}),e.jsx(n,{user:{role:"user",name:"Bob"},children:"User"})]})}export{i as App,n as Badge,a as Role};
