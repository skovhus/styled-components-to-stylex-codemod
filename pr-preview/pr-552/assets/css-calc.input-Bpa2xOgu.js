import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-ByuVNZ8G.js";var n=e(),r=t.div`
  width: calc(100% - 40px);
  max-width: calc(1200px - 2rem);
  margin: 0 auto;
  padding: calc(16px + 1vw);
`,i=t.aside`
  width: calc(25% - 20px);
  min-width: calc(200px + 2vw);
  height: calc(100vh - 60px);
  padding: calc(8px * 2);
`,a=t.div`
  display: grid;
  grid-template-columns: repeat(3, calc(33.333% - 20px));
  gap: calc(10px + 0.5vw);
`,o=t.div`
  flex: 0 0 calc(50% - 1rem);
  padding: calc(1rem / 2);
`,s=t.div`
  width: calc(100% - calc(20px + 2rem));
  margin: calc(10px + calc(5px * 2));
`,c=t.div`
  --base-size: 16px;
  width: calc(var(--base-size) * 10);
  padding: calc(var(--base-size) / 2);
`,l=t.div`
  height: max(100px, ${e=>e.$dynamicHeight});
  padding: 8px;
  background-color: lightblue;
`,u=t.div`
  height: ${e=>e.$size??44}px;
  margin-bottom: -${e=>e.$size??44}px;
  background-color: lavender;
`,d=()=>(0,n.jsxs)(r,{children:[(0,n.jsxs)(a,{children:[(0,n.jsx)(o,{children:`Item 1`}),(0,n.jsx)(o,{children:`Item 2`})]}),(0,n.jsx)(i,{children:`Sidebar content`}),(0,n.jsx)(s,{children:`Complex calc`}),(0,n.jsx)(c,{children:`With variables`}),(0,n.jsx)(l,{$dynamicHeight:`300px`,children:`CSS functions`}),(0,n.jsx)(u,{$size:32,children:`Negative offset`})]});export{d as App};