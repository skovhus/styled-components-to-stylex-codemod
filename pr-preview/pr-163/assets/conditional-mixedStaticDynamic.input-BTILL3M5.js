import{j as i,d as o,l}from"./index-DMuxzsKV.js";const n=24,s=o.div`
  position: relative;
  height: 80px;
  background: #f0f0f0;
  border: 1px solid #ccc;
`,d=o.div`
  display: flex;
  justify-content: center;
  align-items: center;
  background: paleturquoise;
  padding: 8px;

  ${e=>e.$position==="fixed"?l`
          position: absolute;
          bottom: 16px;
          left: ${e.$sidebarCollapsed?0:n}px;
          right: ${e.$sidebarCollapsed?0:n}px;
        `:""}
`,r=()=>i.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:16},children:[i.jsxs("div",{children:[i.jsx("div",{children:"Position fixed + sidebar expanded (24px margins):"}),i.jsx(s,{children:i.jsx(d,{$sidebarCollapsed:!1,$position:"fixed",children:"Content"})})]}),i.jsxs("div",{children:[i.jsx("div",{children:"Position fixed + sidebar collapsed (0px margins):"}),i.jsx(s,{children:i.jsx(d,{$sidebarCollapsed:!0,$position:"fixed",children:"Content"})})]}),i.jsxs("div",{children:[i.jsx("div",{children:"Position relative (no absolute positioning, normal flow):"}),i.jsx(s,{children:i.jsx(d,{$sidebarCollapsed:!1,$position:"relative",children:"Content"})})]})]});export{r as App};
