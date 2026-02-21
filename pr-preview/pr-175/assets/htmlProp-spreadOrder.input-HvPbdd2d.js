import{j as c,c as e}from"./index-DHeQ_gfE.js";const n=e.img`
  max-width: 180px;
  object-fit: cover;
`;function s(t){const r=`https://proxy.example.com/${t.src}`;return c.jsx(n,{...t,src:r})}const i=e.div`
  padding: 8px;
`;function u(t,r){return c.jsx(i,{...t,"data-test":"middle",...r})}function x(){return c.jsx(s,{src:"test.jpg"})}export{x as App,u as MultiSpread,s as SecureThumbnail};
