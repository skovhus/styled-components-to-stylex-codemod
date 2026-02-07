import{j as e,d as s}from"./index-DQGQMgP1.js";const t=s.div`
  background-color: ${({enabled:l,theme:d})=>l?d.color.greenBase:d.color.labelMuted};
  color: white;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 12px;
  font-weight: bold;
`,n=()=>e.jsxs("div",{style:{display:"flex",gap:16,padding:16},children:[e.jsx(t,{enabled:!0,children:"On"}),e.jsx(t,{enabled:!1,children:"Off"}),e.jsx(t,{children:"Default"})]});export{n as App};
