import{j as e,a as p}from"./index-CBL-22lJ.js";const d=p.input`
  padding: 12px;
  border: 1px solid #ccc;
  background: white;

  &::placeholder {
    color: ${o=>o.theme.color.labelMuted};
  }
`,r=()=>e.jsxs("div",{style:{display:"grid",gap:12,padding:16},children:[e.jsx(d,{placeholder:"Muted placeholder"}),e.jsx(d,{placeholder:"Second input"})]});export{r as App};
