import{j as i,a as d,b as t}from"./index-CYapH9Fo.js";const o=24,s=d.div`
  position: relative;
  height: 80px;
  background: #f0f0f0;
  border: 1px solid #ccc;
`,n=d.div`
  display: flex;
  justify-content: center;
  align-items: center;
  background: paleturquoise;
  padding: 8px;

  ${e=>e.$position==="fixed"?t`
          position: absolute;
          bottom: 16px;
          left: ${e.$sidebarCollapsed?0:o}px;
          right: ${e.$sidebarCollapsed?0:o}px;
        `:""}
`,r=()=>i.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:16},children:[i.jsxs("div",{children:[i.jsx("div",{children:"Position fixed + sidebar expanded (24px margins):"}),i.jsx(s,{children:i.jsx(n,{$sidebarCollapsed:!1,$position:"fixed",children:"Content"})})]}),i.jsxs("div",{children:[i.jsx("div",{children:"Position fixed + sidebar collapsed (0px margins):"}),i.jsx(s,{children:i.jsx(n,{$sidebarCollapsed:!0,$position:"fixed",children:"Content"})})]}),i.jsxs("div",{children:[i.jsx("div",{children:"Position relative (no absolute positioning, normal flow):"}),i.jsx(s,{children:i.jsx(n,{$sidebarCollapsed:!1,$position:"relative",children:"Content"})})]})]});export{r as App};
