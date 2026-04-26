import{c as e,f as t,u as n}from"./index-DimFOxuE.js";var r=t(),i=24,a=n.div`
  position: relative;
  height: 80px;
  background: #f0f0f0;
  border: 1px solid #ccc;
`,o=n.div`
  display: flex;
  justify-content: center;
  align-items: center;
  background: paleturquoise;
  padding: 8px;

  ${t=>t.$position===`fixed`?e`
          position: absolute;
          bottom: 16px;
          left: ${t.$sidebarCollapsed?0:i}px;
          right: ${t.$sidebarCollapsed?0:i}px;
        `:``}
`,s=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16},children:[(0,r.jsxs)(`div`,{children:[(0,r.jsx)(`div`,{children:`Position fixed + sidebar expanded (24px margins):`}),(0,r.jsx)(a,{children:(0,r.jsx)(o,{$sidebarCollapsed:!1,$position:`fixed`,children:`Content`})})]}),(0,r.jsxs)(`div`,{children:[(0,r.jsx)(`div`,{children:`Position fixed + sidebar collapsed (0px margins):`}),(0,r.jsx)(a,{children:(0,r.jsx)(o,{$sidebarCollapsed:!0,$position:`fixed`,children:`Content`})})]}),(0,r.jsxs)(`div`,{children:[(0,r.jsx)(`div`,{children:`Position relative (no absolute positioning, normal flow):`}),(0,r.jsx)(a,{children:(0,r.jsx)(o,{$sidebarCollapsed:!1,$position:`relative`,children:`Content`})})]})]});export{s as App};