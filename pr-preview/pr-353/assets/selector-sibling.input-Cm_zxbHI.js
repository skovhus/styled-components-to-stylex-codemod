import{j as e,c as o}from"./index-LqAZ_g7b.js";const i=o.div`
  color: blue;
  padding: 8px 16px;

  /* Adjacent sibling: element immediately following */
  & + & {
    color: red;
    background: lime;
  }
`,d=o.div`
  color: blue;

  & + & {
    color: ${n=>n.theme.color.labelBase};
  }
`,l=o.div`
  & + & {
    margin-top: 16px;
  }
`,c=()=>e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:4,padding:16},children:[e.jsx(i,{children:"First (blue)"}),e.jsx(i,{children:"Second (red, lime - adjacent)"}),e.jsx(i,{children:"Third (red, lime - adjacent)"}),e.jsx(d,{children:"First themed"}),e.jsx(d,{children:"Second themed (theme color)"}),e.jsx(l,{children:"First row"}),e.jsx(l,{children:"Second row (margin-top)"})]});export{c as App};
