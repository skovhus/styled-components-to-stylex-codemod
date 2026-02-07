import{j as i,d as n}from"./index-CizWbUBP.js";const t=n.div`
  overflow: hidden;
  ${d=>d.$width?`--component-width: ${d.$width}px`:""};
`,e=n.div`
  background-color: coral;
  width: calc(var(--component-width) + 60px);
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
`,r=()=>i.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"16px"},children:[i.jsx(t,{$width:100,children:i.jsx(e,{children:"Width: 100px + 60px = 160px"})}),i.jsx(t,{$width:200,children:i.jsx(e,{children:"Width: 200px + 60px = 260px"})}),i.jsx(t,{$width:void 0,children:i.jsx(e,{children:"Width: undefined (no custom property)"})})]});export{r as App};
