import{j as c,a}from"./index-D5aCdehV.js";const e=a.div`
  width: calc(100% - 40px);
  max-width: calc(1200px - 2rem);
  margin: 0 auto;
  padding: calc(16px + 1vw);
`,l=a.aside`
  width: calc(25% - 20px);
  min-width: calc(200px + 2vw);
  height: calc(100vh - 60px);
  padding: calc(8px * 2);
`,d=a.div`
  display: grid;
  grid-template-columns: repeat(3, calc(33.333% - 20px));
  gap: calc(10px + 0.5vw);
`,i=a.div`
  flex: 0 0 calc(50% - 1rem);
  padding: calc(1rem / 2);
`,s=a.div`
  width: calc(100% - calc(20px + 2rem));
  margin: calc(10px + calc(5px * 2));
`,t=a.div`
  --base-size: 16px;
  width: calc(var(--base-size) * 10);
  padding: calc(var(--base-size) / 2);
`,r=()=>c.jsxs(e,{children:[c.jsxs(d,{children:[c.jsx(i,{children:"Item 1"}),c.jsx(i,{children:"Item 2"})]}),c.jsx(l,{children:"Sidebar content"}),c.jsx(s,{children:"Complex calc"}),c.jsx(t,{children:"With variables"})]});export{r as App};
