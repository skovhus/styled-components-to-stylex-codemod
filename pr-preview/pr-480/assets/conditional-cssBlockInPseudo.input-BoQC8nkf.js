import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,d as n}from"./index-BcrP2AbS.js";import{g as r}from"./helpers-BxMcqdjv.js";var i=e(),a=t.button`
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
`,o=t.button`
  color: #334155;
  background-color: #f8fafc;

  ${e=>e.$interactive?n`
          cursor: pointer;

          &:${r} {
            background-color: ${e.theme.color.bgBaseHover};
            color: ${e.theme.color.labelTitle};
          }
        `:void 0}
`,s=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:8,padding:16},children:[(0,i.jsx)(a,{"data-state":`active`,children:`Active`}),(0,i.jsx)(a,{"data-state":`inactive`,children:`Inactive`}),(0,i.jsx)(o,{$interactive:!0,children:`Interactive`})]});export{s as App};