import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,l as n}from"./index-B0Lj3XEI.js";import{D as r,a as i,g as a,h as o,p as s}from"./helpers-B5L64KHa.js";var c=e(),l=n.button`
  color: #111;
  border-radius: 5px;
  box-shadow: none;

  &[data-state="active"] {
    ${e=>e.theme.isDark?t`
          background: ${e.theme.color.bgSub};
          box-shadow: 0 0 0 1px ${e.theme.color.bgBorderFaint};
        `:t`
        background: ${e.theme.color.bgBase};
        box-shadow: 0 0 0 1px ${e.theme.color.bgBorderFaint};
      `}
  }
`,u=n.button`
  color: #334155;
  background-color: #f8fafc;

  ${e=>e.$interactive?t`
          cursor: pointer;

          &:${a} {
            background-color: ${e.theme.color.bgBaseHover};
            color: ${e.theme.color.labelTitle};
          }
        `:void 0}
`,d=n.span`
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${e=>e.$background||`transparent`};
  transition-property: background-color, border;
  transition-duration: ${r(`normal`)};

  ${e=>e.$background?t`
          border-radius: 4px;

          &:${o} {
            background-color: ${i(`bgBorderSolid`)};
            border-color: ${i(`bgBorderSolid`)};
            box-shadow: ${s(`dark`)};
            transition-duration: ${r(`fast`)};
          }
        `:``}
`,f=()=>(0,c.jsxs)(`div`,{style:{display:`flex`,gap:8,padding:16},children:[(0,c.jsx)(l,{"data-state":`active`,children:`Active`}),(0,c.jsx)(l,{"data-state":`inactive`,children:`Inactive`}),(0,c.jsx)(u,{$interactive:!0,children:`Interactive`}),(0,c.jsx)(d,{$background:`#fed7aa`,children:`Icon`}),(0,c.jsx)(d,{children:`Plain icon`})]});export{f as App};