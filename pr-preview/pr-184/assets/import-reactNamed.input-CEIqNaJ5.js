import{r,j as t,a}from"./index-SYvytoAN.js";const n=a.div`
  padding: 16px;
  background: white;
`,c=a.button`
  padding: 8px 16px;
  background: ${o=>o.variant==="primary"?"blue":"gray"};
  color: white;
`,i=()=>{const o=r.useCallback(()=>{console.log("clicked")},[]);return r.useEffect(()=>{console.log("mounted")},[]),t.jsx(n,{onClick:o,children:t.jsx(c,{variant:"primary",children:"Click me"})})};export{i as App};
