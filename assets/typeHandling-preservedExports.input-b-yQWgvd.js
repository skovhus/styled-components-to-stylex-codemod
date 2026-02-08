import{j as t,a}from"./index-C0e-C6u8.js";const n=a.button`
  padding: ${r=>r.size==="large"?"12px 24px":"8px 16px"};
  background: ${r=>r.variant==="primary"?"blue":"gray"};
  color: white;
`;function e(r){return t.jsx(n,{...r,children:"Click me"})}function o(){return t.jsx(n,{variant:"primary",size:"large",children:"Primary Button"})}export{o as App,n as Button,e as createButton};
