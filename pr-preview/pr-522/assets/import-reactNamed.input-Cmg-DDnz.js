import{s as e,t}from"./jsx-runtime-B8sTdNyf.js";import{l as n,p as r}from"./index-icw5lZFf.js";var i=e(r(),1),a=t(),o=n.div`
  padding: 16px;
  background: white;
`,s=n.button`
  padding: 8px 16px;
  background: ${e=>e.variant===`primary`?`blue`:`gray`};
  color: white;
`,c=()=>{let e=(0,i.useCallback)(()=>{console.log(`clicked`)},[]);return(0,i.useEffect)(()=>{console.log(`mounted`)},[]),(0,a.jsx)(o,{onClick:e,children:(0,a.jsx)(s,{variant:`primary`,children:`Click me`})})};export{c as App};