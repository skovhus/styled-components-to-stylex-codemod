import{r,j as t,c}from"./index-DHeQ_gfE.js";const n=c.div`
  padding: 16px;
  background: white;
`,a=c.button`
  padding: 8px 16px;
  background: ${o=>o.variant==="primary"?"blue":"gray"};
  color: white;
`,i=()=>{const o=r.useCallback(()=>{console.log("clicked")},[]);return r.useEffect(()=>{console.log("mounted")},[]),t.jsx(n,{onClick:o,children:t.jsx(a,{variant:"primary",children:"Click me"})})};export{i as App};
