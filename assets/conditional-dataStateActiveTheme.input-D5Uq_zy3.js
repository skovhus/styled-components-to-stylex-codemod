import{j as e,c as o}from"./index-IYZhH-t4.js";const i=o.div`
  display: flex;
  padding: 1px;
  border-radius: 6px;
  background: ${t=>t.theme.isDark?t.theme.color.bgBase:t.theme.color.bgSub};
`,a=o.button`
  flex: 1;
  min-height: 32px;
  font-size: 14px;
  color: #111;
  border-radius: 5px;
  box-shadow: none;

  &[data-state="inactive"] {
    color: #999;
  }

  &[data-state="active"] {
    background: ${t=>t.theme.color.bgBase};
    box-shadow: 0 0 0 1px ${t=>t.theme.color.bgBorderFaint},
      0 1px 2px rgba(0, 0, 0, 0.1);
  }
`,c=()=>e.jsxs(i,{children:[e.jsx(a,{"data-state":"active",children:"Active Tab"}),e.jsx(a,{"data-state":"inactive",children:"Inactive Tab"}),e.jsx(a,{"data-state":"active",children:"Another Active"})]});export{c as App};
