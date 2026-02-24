import{j as t,s as a,c as r}from"./index-CBCcZPd5.js";const o=r.button`
  color: #111;
  border-radius: 5px;
  box-shadow: none;

  &[data-state="active"] {
    ${e=>e.theme.isDark?a`
          background: ${e.theme.color.bgShade};
          box-shadow: 0 0 0 1px ${e.theme.color.bgBorderThin};
        `:a`
        background: ${e.theme.color.bgBase};
        box-shadow: 0 0 0 1px ${e.theme.color.bgBorderThin};
      `}
  }
`,s=()=>t.jsxs("div",{style:{display:"flex",gap:8,padding:16},children:[t.jsx(o,{"data-state":"active",children:"Active"}),t.jsx(o,{"data-state":"inactive",children:"Inactive"})]});export{s as App};
