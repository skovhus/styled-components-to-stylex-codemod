import{c as e,p as t}from"./index-DIKafusi.js";var n=t(),r=e.div`
  display: grid;
  grid-template-columns: var(--column-width);
  min-width: var(--column-min-width, min-content, 0);
  width: min(var(--column-width), var(--column-max-width));
  gap: 8px;
  background-color: #f1f5f9;
`,i=()=>(0,n.jsx)(`div`,{style:{padding:12},children:(0,n.jsx)(r,{children:`Variable columns`})});export{i as App};