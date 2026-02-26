import{j as e,s as a,c as r}from"./index-CuD-Fq-1.js";const o=r.button`
  color: #111;
  border-radius: 5px;
  box-shadow: none;

  &[data-state="active"] {
    ${t=>t.theme.isDark?a`
          background: ${t.theme.color.bgSub};
          box-shadow: 0 0 0 1px ${t.theme.color.bgBorderFaint};
        `:a`
        background: ${t.theme.color.bgBase};
        box-shadow: 0 0 0 1px ${t.theme.color.bgBorderFaint};
      `}
  }
`,c=()=>e.jsxs("div",{style:{display:"flex",gap:8,padding:16},children:[e.jsx(o,{"data-state":"active",children:"Active"}),e.jsx(o,{"data-state":"inactive",children:"Inactive"})]});export{c as App};
