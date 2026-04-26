import{c as e,f as t,u as n}from"./index-DimFOxuE.js";var r=t(),i=n.button`
  color: #111;
  border-radius: 5px;
  box-shadow: none;

  &[data-state="active"] {
    ${t=>t.theme.isDark?e`
          background: ${t.theme.color.bgSub};
          box-shadow: 0 0 0 1px ${t.theme.color.bgBorderFaint};
        `:e`
        background: ${t.theme.color.bgBase};
        box-shadow: 0 0 0 1px ${t.theme.color.bgBorderFaint};
      `}
  }
`,a=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,gap:8,padding:16},children:[(0,r.jsx)(i,{"data-state":`active`,children:`Active`}),(0,r.jsx)(i,{"data-state":`inactive`,children:`Inactive`})]});export{a as App};