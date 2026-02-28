import{j as e,c as d}from"./index-DLrC4niQ.js";const i=d.div`
  overflow: hidden;
  position: relative;
  background: #f0f0f0;
  ${t=>t.align!=="top"?`display: flex;
         align-items: ${t.align==="center"?"center":"flex-end"};
         & > div {
           ${t.$property==="height"?"width":"height"}: 100%;
         }`:""}
`,l=()=>e.jsxs("div",{style:{display:"flex",gap:"16px"},children:[e.jsx(i,{align:"top",style:{height:"100px",width:"80px"},children:e.jsx("div",{style:{background:"#bf4f74",padding:"8px",color:"white"},children:"Top"})}),e.jsx(i,{align:"center",style:{height:"100px",width:"80px"},children:e.jsx("div",{style:{background:"#4f74bf",padding:"8px",color:"white"},children:"Center"})}),e.jsx(i,{align:"bottom",style:{height:"100px",width:"80px"},children:e.jsx("div",{style:{background:"#22c55e",padding:"8px",color:"white"},children:"Bottom"})}),e.jsx(i,{align:"center",$property:"width",style:{height:"100px",width:"80px"},children:e.jsx("div",{style:{background:"#eab308",padding:"8px",color:"white"},children:"CtrW"})})]});export{l as App};
