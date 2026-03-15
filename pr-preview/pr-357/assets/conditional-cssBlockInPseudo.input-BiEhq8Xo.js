import"./react-D4cBbUL-.js";import{f as e,s as t,u as n}from"./index-CyUUxAP6.js";var r=e(),i=t.button`
  color: #111;
  border-radius: 5px;
  box-shadow: none;

  &[data-state="active"] {
    ${e=>e.theme.isDark?n`
          background: ${e.theme.color.bgSub};
          box-shadow: 0 0 0 1px ${e.theme.color.bgBorderFaint};
        `:n`
        background: ${e.theme.color.bgBase};
        box-shadow: 0 0 0 1px ${e.theme.color.bgBorderFaint};
      `}
  }
`,a=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,gap:8,padding:16},children:[(0,r.jsx)(i,{"data-state":`active`,children:`Active`}),(0,r.jsx)(i,{"data-state":`inactive`,children:`Inactive`})]});export{a as App};