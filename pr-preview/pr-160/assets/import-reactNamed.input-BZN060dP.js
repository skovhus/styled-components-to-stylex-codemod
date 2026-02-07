import{r,j as t,d as n}from"./index-B-YTonrH.js";const a=n.div`
  padding: 16px;
  background: white;
`,c=n.button`
  padding: 8px 16px;
  background: ${o=>o.variant==="primary"?"blue":"gray"};
  color: white;
`,i=()=>{const o=r.useCallback(()=>{console.log("clicked")},[]);return r.useEffect(()=>{console.log("mounted")},[]),t.jsx(a,{onClick:o,children:t.jsx(c,{variant:"primary",children:"Click me"})})};export{i as App};
