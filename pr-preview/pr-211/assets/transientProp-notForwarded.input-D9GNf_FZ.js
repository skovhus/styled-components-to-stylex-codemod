import{j as o,c as s}from"./index-FP_Cx-M0.js";function a(r){const{column:e,gap:l,className:c,style:n,children:t}=r;return o.jsx("div",{className:c,style:{display:"flex",flexDirection:e?"column":"row",gap:l,...n},children:t})}const i=s(a)`
  overflow-y: auto;
  background-color: ${r=>r.$applyBackground?"gray":"inherit"};
`,u=()=>o.jsxs(i,{$applyBackground:!0,column:!0,gap:10,children:[o.jsx("div",{children:"Item 1"}),o.jsx("div",{children:"Item 2"})]});export{u as App,i as Scrollable};
