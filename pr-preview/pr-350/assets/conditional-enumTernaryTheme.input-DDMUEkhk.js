import{j as r,c as i}from"./index-DWPDPZmu.js";var n=(e=>(e.primary="primary",e.gradient="gradient",e.success="success",e.warning="warning",e.error="error",e))(n||{});const t=i.div`
  height: 40px;
  padding: 8px 16px;
  background: ${e=>e.$type==="success"?e.theme.color.greenBase:e.$type==="error"?e.theme.color.bgBase:e.$type==="warning"?e.theme.color.bgBaseHover:e.$type==="primary"?e.theme.color.controlPrimary:e.$type==="gradient"?`linear-gradient(to right, ${e.theme.color.bgBorderSolid}, ${e.theme.color.labelMuted})`:e.theme.color.labelBase};
`,c=()=>r.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:8,padding:16},children:[r.jsx(t,{$type:"success",children:"Success"}),r.jsx(t,{$type:"error",children:"Error"}),r.jsx(t,{$type:"warning",children:"Warning"}),r.jsx(t,{$type:"primary",children:"Primary"}),r.jsx(t,{$type:"gradient",children:"Gradient"}),r.jsx(t,{children:"Default"})]});export{c as App,n as ProgressType};
