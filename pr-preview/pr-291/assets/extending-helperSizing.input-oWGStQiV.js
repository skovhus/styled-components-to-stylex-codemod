import{j as e,c as s}from"./index-m4eC-B2s.js";const l={small:20,medium:24,large:32};function r(t){const n=l[t];return`width: ${n}px; height: ${n}px;`}const i=s.div`
  display: flex;
  position: relative;
  align-items: center;
  justify-content: center;
  line-height: 0;
  flex-shrink: 0;
  aspect-ratio: 1 / 1;
  ${t=>t.disabled?"opacity: 0.5;":""};
  ${t=>r(t.size)}
`,d=()=>e.jsxs("div",{style:{display:"flex",gap:"8px",alignItems:"center"},children:[e.jsx(i,{size:"small",children:e.jsx("div",{style:{background:"#bf4f74",width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:"10px"},children:"S"})}),e.jsx(i,{size:"medium",children:e.jsx("div",{style:{background:"#4f74bf",width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:"10px"},children:"M"})}),e.jsx(i,{size:"large",children:e.jsx("div",{style:{background:"#22c55e",width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:"10px"},children:"L"})}),e.jsx(i,{size:"medium",disabled:!0,children:e.jsx("div",{style:{background:"#666",width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:"10px"},children:"Md"})})]});export{d as App};
