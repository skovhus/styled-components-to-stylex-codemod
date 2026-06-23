import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,u as n}from"./index-DsLLXDXF.js";import{O as r,a as i,g as a,h as o,p as s}from"./helpers-BuH1r5xJ.js";var c=e(),l=n.button`
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
`,m=n.span`
  display: inline-flex;
  padding: 4px 8px;
  color: #475569;

  ${e=>e.$active&&t`
      color: #2563eb;

      &:focus {
        color: #16a34a;
      }

      &:${o} {
        color: ${i(`labelTitle`)};
      }
    `}
`,h=n.span`
  display: inline-flex;
  padding: 4px 8px;
  color: ${e=>e.$color};

  ${e=>e.$active&&t`
      &:${o} {
        color: #dc2626;
      }
    `}
`,g=n.span`
  display: inline-flex;
  padding: 4px 8px;
  background-color: #f8fafc;
  color: #334155;

  ${e=>e.$active&&t`
      &:${o} {
        background-color: ${i(`bgBaseHover`)};
      }

      &:focus:${o} {
        color: ${i(`labelTitle`)};
      }
    `}
`,_=n.span`
  display: inline-flex;
  padding: 4px 8px;
  color: #475569;

  ${e=>e.$active&&t`
      &:hover {
        color: #dc2626;
      }

      &:focus {
        color: #2563eb;
      }
    `}
`,v=n.span`
  display: inline-flex;
  padding: 4px 8px;
  color: hotpink;
  background-color: blue;
  background-image: url(/old.png);

  ${e=>e.$enabled&&t`
      opacity: ${e=>+!!e.$visible};
      pointer-events: ${e=>e.$visible?`auto`:`none`};
      padding: ${e=>e.$wide?`8px 16px`:`4px`};
      background: ${e=>e.$image?`url(/icon.png)`:`red`};
      margin: ${e=>e.theme.isDark?`8px 16px`:`4px`};
    `}
`,y=n.span`
  display: inline-flex;
  padding: 4px 8px;
  background-color: #ecfeff;

  ${e=>e.$active&&t`
      &:hover {
        padding: 4px 8px;
        padding-inline: 2px;
        padding-right: 3px;
      }
    `}
`,b=n.span`
  display: inline-flex;
  padding: 4px 8px;
  background-color: #fdf2f8;

  ${e=>e.$active&&t`
      padding-inline-start: 2px;
    `}
`,x=n.span`
  display: inline-flex;
  padding: 4px 8px;
  background-color: #d1fae5;

  @media (min-width: 600px) {
    padding-right: 20px;
  }

  ${e=>e.$active&&t`
      &:hover {
        padding-inline: 2px;
      }
    `}
`,S=n.span`
  display: inline-flex;
  padding: 4px 8px;
  background-color: #fef3c7;

  @media (min-width: 600px) {
    padding-right: 20px;
  }

  ${e=>e.$active&&t`
      padding-inline: 2px;
    `}
`,C=()=>(0,c.jsxs)(`div`,{style:{display:`flex`,flexWrap:`wrap`,gap:8,padding:16,width:718},children:[(0,c.jsx)(l,{"data-state":`active`,children:`Active`}),(0,c.jsx)(l,{"data-state":`inactive`,children:`Inactive`}),(0,c.jsx)(u,{$interactive:!0,children:`Interactive`}),(0,c.jsx)(d,{$background:`#fed7aa`,children:`Icon`}),(0,c.jsx)(d,{children:`Plain icon`}),(0,c.jsx)(f,{children:`Enabled icon`}),(0,c.jsx)(f,{$disabled:!0,children:`Disabled icon`}),(0,c.jsx)(p,{$active:!0,tabIndex:0,children:`Focus alias`}),(0,c.jsx)(m,{$active:!0,tabIndex:0,children:`Alias default`}),(0,c.jsx)(h,{$active:!0,$color:`#2563eb`,children:`Alias order`}),(0,c.jsx)(g,{$active:!0,tabIndex:0,children:`Dual alias`}),(0,c.jsx)(_,{$active:!0,tabIndex:0,children:`Multi pseudo`}),(0,c.jsx)(v,{$enabled:!0,$visible:!0,$wide:!0,$image:!0,children:`Visible finite block`}),(0,c.jsx)(v,{$enabled:!0,children:`Hidden finite block`}),(0,c.jsx)(y,{$active:!0,children:`Logical padding hover`}),(0,c.jsx)(b,{$active:!0,children:`Logical side padding`}),(0,c.jsx)(x,{$active:!0,children:`Logical media padding`}),(0,c.jsx)(S,{$active:!0,children:`Logical scalar media padding`})]});export{C as App};