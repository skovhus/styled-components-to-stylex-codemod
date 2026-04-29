import{o as e}from"./chunk-jRWAZmH_.js";import{f as t,p as n,s as r}from"./index-DQ4iL9Cs.js";var i=e(n(),1),a=t(),o=r.div`
  padding: 16px;
  background: white;
`,s=r.button`
  padding: 8px 16px;
  background: ${e=>e.variant===`primary`?`blue`:`gray`};
  color: white;
`,c=()=>{let e=(0,i.useCallback)(()=>{console.log(`clicked`)},[]);return(0,i.useEffect)(()=>{console.log(`mounted`)},[]),(0,a.jsx)(o,{onClick:e,children:(0,a.jsx)(s,{variant:`primary`,children:`Click me`})})};export{c as App};