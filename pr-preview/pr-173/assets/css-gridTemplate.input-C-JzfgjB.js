import{j as o,a as e}from"./index-Bc-sDEmu.js";const r=e.div`
  display: grid;
  position: relative;
  grid-template-columns: ${()=>`
    [gutter] var(--line-number-width, 50px)
    [code] minmax(0, 1fr)
  `};
  grid-auto-rows: minmax(0px, auto);
  gap: 4px 8px;
  padding: 8px;
  border: 1px solid #ccc;
`,n=e.div`
  background: #f3f3f3;
  color: #666;
  text-align: right;
  padding: 4px 6px;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
`,i=e.div`
  background: #e7f3ff;
  color: #0b4f6c;
  padding: 4px 8px;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
`,s=()=>o.jsxs(r,{children:[o.jsx(n,{children:"1"}),o.jsx(i,{children:"const answer = 42;"}),o.jsx(n,{children:"2"}),o.jsxs(i,{children:["function add(a, b) ","{"]}),o.jsx(n,{children:"3"}),o.jsxs(i,{children:["  ","return a + b;"]}),o.jsx(n,{children:"4"}),o.jsx(i,{children:"}"})]});export{s as App};
