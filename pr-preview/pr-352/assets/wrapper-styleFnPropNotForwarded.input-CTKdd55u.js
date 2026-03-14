import{j as r,c as e}from"./index-DyIJ1_wz.js";import{F as a}from"./flex-CwS3Aaiv.js";const o=e(a)`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
  background-color: ${t=>t.$applyBackground?"gray":"inherit"};
  scrollbar-gutter: ${t=>t.gutter||"auto"};
`,n=()=>r.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:16,padding:16},children:[r.jsx(o,{gutter:"stable",$applyBackground:!0,gap:8,children:r.jsx("div",{children:"Stable gutter with background"})}),r.jsx(o,{gutter:"auto",gap:4,children:r.jsx("div",{children:"Auto gutter, no background"})}),r.jsx(o,{gap:12,children:r.jsx("div",{children:"Default (no gutter, no background)"})})]});export{n as App,o as Scrollable};
