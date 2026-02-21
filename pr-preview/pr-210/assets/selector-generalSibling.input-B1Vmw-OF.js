import{j as o,a as i}from"./index-ByrUIRfx.js";const r=i.div`
  color: blue;
  padding: 8px 16px;

  /* General sibling selector */
  & ~ & {
    border-bottom: 2px solid gray;
  }
`,e=()=>o.jsxs("div",{style:{padding:16},children:[o.jsx(r,{children:"First"}),o.jsx(r,{children:"Second (border-bottom in CSS)"}),o.jsx(r,{children:"Third (border-bottom in CSS)"})]});export{e as App};
