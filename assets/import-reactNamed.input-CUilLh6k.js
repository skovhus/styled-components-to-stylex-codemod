import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-DVlcDaUT.js";var i=e(t(),1),a=n(),o=r.div`
  padding: 16px;
  background: white;
`,s=r.button`
  padding: 8px 16px;
  background: ${e=>e.variant===`primary`?`blue`:`gray`};
  color: white;
`,c=()=>{let e=(0,i.useCallback)(()=>{console.log(`clicked`)},[]);return(0,i.useEffect)(()=>{console.log(`mounted`)},[]),(0,a.jsx)(o,{onClick:e,children:(0,a.jsx)(s,{variant:`primary`,children:`Click me`})})};export{c as App};