import{o as e}from"./chunk-jRWAZmH_.js";import{c as t,m as n,p as r}from"./index-Ctuq5blu.js";var i=e(n(),1),a=r(),o=t.div`
  padding: 16px;
  background: white;
`,s=t.button`
  padding: 8px 16px;
  background: ${e=>e.variant===`primary`?`blue`:`gray`};
  color: white;
`,c=()=>{let e=(0,i.useCallback)(()=>{console.log(`clicked`)},[]);return(0,i.useEffect)(()=>{console.log(`mounted`)},[]),(0,a.jsx)(o,{onClick:e,children:(0,a.jsx)(s,{variant:`primary`,children:`Click me`})})};export{c as App};