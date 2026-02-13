import{j as e,a as n}from"./index-BxcpDfu-.js";const s=n.img`
  max-width: 180px;
  object-fit: cover;
`;function c(t){const r=`https://proxy.example.com/${t.src}`;return e.jsx(s,{...t,src:r})}const i=n.div`
  padding: 8px;
`;function a(t,r){return e.jsx(i,{...t,"data-test":"middle",...r})}function u(){return e.jsx(c,{src:"test.jpg"})}export{u as App,a as MultiSpread,c as SecureThumbnail};
