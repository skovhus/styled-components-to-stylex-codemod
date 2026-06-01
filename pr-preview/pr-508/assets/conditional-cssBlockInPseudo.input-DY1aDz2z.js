import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,l as n}from"./index-C7PvTXxr.js";import{D as r,a as i,g as a,h as o,p as s}from"./helpers-CTvE2yYk.js";var c=e(),l=n.button`
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
          opacity: ${e=>e.$background?1:.8};

          &:${o} {
            background-color: ${i(`bgBorderSolid`)};
            border-color: ${i(`bgBorderSolid`)};
            box-shadow: ${s(`dark`)};
            transition-duration: ${r(`fast`)};
          }
        `:``}
`,f=n.span`
  display: inline-flex;
  padding: 4px 8px;
  background-color: #eef2ff;
  color: #312e81;

  ${e=>e.$disabled?void 0:t`
          cursor: pointer;

          &:${o} {
            background-color: ${i(`bgBaseHover`)};
            color: ${i(`labelTitle`)};
          }
        `}
`,p=n.span`
  display: inline-flex;
  padding: 4px 8px;
  color: #475569;

  ${e=>e.$active&&t`
      &:focus:${o} {
        color: ${i(`labelTitle`)};
      }
    `}
`,m=()=>(0,c.jsxs)(`div`,{style:{display:`flex`,gap:8,padding:16},children:[(0,c.jsx)(l,{"data-state":`active`,children:`Active`}),(0,c.jsx)(l,{"data-state":`inactive`,children:`Inactive`}),(0,c.jsx)(u,{$interactive:!0,children:`Interactive`}),(0,c.jsx)(d,{$background:`#fed7aa`,children:`Icon`}),(0,c.jsx)(d,{children:`Plain icon`}),(0,c.jsx)(f,{children:`Enabled icon`}),(0,c.jsx)(f,{$disabled:!0,children:`Disabled icon`}),(0,c.jsx)(p,{$active:!0,tabIndex:0,children:`Focus alias`})]});export{m as App};