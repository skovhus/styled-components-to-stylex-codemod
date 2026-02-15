import{j as e,a as i}from"./index-CxZ44mwd.js";const t=i.div`
  background-color: ${({enabled:s,theme:l})=>s?l.color.greenBase:l.color.labelMuted};
  color: white;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 12px;
  font-weight: bold;
`,o=()=>e.jsxs("div",{style:{display:"flex",gap:16,padding:16},children:[e.jsx(t,{enabled:!0,children:"On"}),e.jsx(t,{enabled:!1,children:"Off"}),e.jsx(t,{children:"Default"})]});export{o as App};
