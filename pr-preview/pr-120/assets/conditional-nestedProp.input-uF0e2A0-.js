import{d as s,j as e}from"./index-B4qiiF0X.js";var d=(r=>(r.admin="admin",r.user="user",r))(d||{});const n=s.div`
  ${r=>r.user.role==="admin"?`
    color: red;
  `:""}
`;function a(){return e.jsxs("div",{children:[e.jsx(n,{user:{role:"admin",name:"Ada"},children:"Admin"}),e.jsx(n,{user:{role:"user",name:"Bob"},children:"User"})]})}export{a as App,n as Badge,d as Role};
