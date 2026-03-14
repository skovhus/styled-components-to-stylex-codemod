import{j as o,c}from"./index-5aZ3BrvX.js";const e=c.div`
  color: blue;

  & + & {
    color: ${s=>s.theme.color.labelBase};
  }
`,l=()=>o.jsxs("div",{style:{padding:16},children:[o.jsx(e,{children:"First"}),o.jsx(e,{children:"Second (theme color)"})]});export{l as App};
