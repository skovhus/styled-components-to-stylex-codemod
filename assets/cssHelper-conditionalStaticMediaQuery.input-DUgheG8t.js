import{j as p,c as i}from"./index-BUXThEj3.js";const d=i.div`
  padding: 16px;
  background-color: white;

  ${a=>a.$compact&&`
    padding: 8px;
    font-size: 12px;

    @media (min-width: 768px) {
      padding: 12px;
      font-size: 14px;
    }
  `}
`,c=()=>p.jsxs("div",{style:{display:"flex",gap:16,padding:16},children:[p.jsx(d,{$compact:!1,children:"Default Card"}),p.jsx(d,{$compact:!0,children:"Compact Card"})]});export{c as App};
