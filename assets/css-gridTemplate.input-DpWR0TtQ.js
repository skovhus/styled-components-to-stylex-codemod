import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-Dda2rlA_.js";var n=e(),r=t.div`
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
`,i=t.div`
  background: #f3f3f3;
  color: #666;
  text-align: right;
  padding: 4px 6px;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
`,a=t.div`
  background: #e7f3ff;
  color: #0b4f6c;
  padding: 4px 8px;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
`,o=({highlightRow:e=`5`})=>(0,n.jsxs)(r,{children:[(0,n.jsx)(i,{children:`1`}),(0,n.jsx)(a,{children:`const answer = 42;`}),(0,n.jsx)(i,{children:`2`}),(0,n.jsxs)(a,{children:[`function add(a, b) `,`{`]}),(0,n.jsx)(i,{children:`3`}),(0,n.jsxs)(a,{children:[`  `,`return a + b;`]}),(0,n.jsx)(i,{children:`4`}),(0,n.jsx)(a,{children:`}`}),(0,n.jsx)(i,{style:{gridRow:e},children:`*`}),(0,n.jsx)(a,{style:{gridRow:2},children:`highlighted`})]});export{o as App};