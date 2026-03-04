import{j as o,c}from"./index-m4eC-B2s.js";const e=c.div`
  color: blue;

  & + & {
    color: ${s=>s.theme.color.labelBase};
  }
`,l=()=>o.jsxs("div",{style:{padding:16},children:[o.jsx(e,{children:"First"}),o.jsx(e,{children:"Second (theme color)"})]});export{l as App};
