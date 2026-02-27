import{j as i,c as s}from"./index-B7EDBgaE.js";function n(e){return`width: ${e}px; height: ${e}px;`}const t=s.div`
  display: flex;
  position: relative;
  align-items: center;
  justify-content: center;
  line-height: 0;
  flex-shrink: 0;
  aspect-ratio: 1 / 1;
  ${e=>e.disabled?"opacity: 0.5;":""};
  ${e=>n(e.size)}
`,a=()=>i.jsxs("div",{style:{display:"flex",gap:"8px",alignItems:"center"},children:[i.jsx(t,{size:16,children:"16"}),i.jsx(t,{size:24,children:"24"}),i.jsx(t,{size:32,children:"32"}),i.jsx(t,{size:20,disabled:!0,children:"20d"})]});export{a as App};
