import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{i as t,r as n}from"./styled-components.browser.esm-Dy4oaG3m.js";import{O as r,a as i,g as a,h as o,p as s}from"./helpers-daleu_Aj.js";var c=e(),l=t.button`
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
`,u=t.button`
  color: #334155;
  background-color: #f8fafc;

  ${e=>e.$interactive?n`
          cursor: pointer;

          &:${a} {
            background-color: ${e.theme.color.bgBaseHover};
            color: ${e.theme.color.labelTitle};
          }
        `:void 0}
`,d=t.span`
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${e=>e.$background||`transparent`};
  transition-property: background-color, border;
  transition-duration: ${r(`normal`)};

  ${e=>e.$background?n`
          border-radius: 4px;
          opacity: ${e=>e.$background?1:.8};

          &:${o} {
            background-color: ${i(`bgBorderSolid`)};
            border-color: ${i(`bgBorderSolid`)};
            box-shadow: ${s(`dark`)};
            transition-duration: ${r(`fast`)};
          }
        `:``}
`,f=t.span`
  display: inline-flex;
  padding: 4px 8px;
  background-color: #eef2ff;
  color: #312e81;

  ${e=>e.$disabled?void 0:n`
          cursor: pointer;

          &:${o} {
            background-color: ${i(`bgBaseHover`)};
            color: ${i(`labelTitle`)};
          }
        `}
`,p=t.span`
  display: inline-flex;
  padding: 4px 8px;
  color: #475569;

  ${e=>e.$active&&n`
      &:focus:${o} {
        color: ${i(`labelTitle`)};
      }
    `}
`,m=t.span`
  display: inline-flex;
  padding: 4px 8px;
  color: #475569;

  ${e=>e.$active&&n`
      color: #2563eb;

      &:focus {
        color: #16a34a;
      }

      &:${o} {
        color: ${i(`labelTitle`)};
      }
    `}
`,h=t.span`
  display: inline-flex;
  padding: 4px 8px;
  color: ${e=>e.$color};

  ${e=>e.$active&&n`
      &:${o} {
        color: #dc2626;
      }
    `}
`,g=t.span`
  display: inline-flex;
  padding: 4px 8px;
  background-color: #f8fafc;
  color: #334155;

  ${e=>e.$active&&n`
      &:${o} {
        background-color: ${i(`bgBaseHover`)};
      }

      &:focus:${o} {
        color: ${i(`labelTitle`)};
      }
    `}
`,_=t.span`
  display: inline-flex;
  padding: 4px 8px;
  color: #475569;

  ${e=>e.$active&&n`
      &:hover {
        color: #dc2626;
      }

      &:focus {
        color: #2563eb;
      }
    `}
`,v=t.span`
  display: inline-flex;
  padding: 4px 8px;
  color: hotpink;
  background-color: blue;
  background-image: url(/old.png);

  ${e=>e.$enabled&&n`
      opacity: ${e=>+!!e.$visible};
      pointer-events: ${e=>e.$visible?`auto`:`none`};
      padding: ${e=>e.$wide?`8px 16px`:`4px`};
      background: ${e=>e.$image?`url(/icon.png)`:`red`};
      margin: ${e=>e.theme.isDark?`8px 16px`:`4px`};
    `}
`,y=t.span`
  display: inline-flex;
  padding: 4px 8px;
  background-color: #ecfeff;

  ${e=>e.$active&&n`
      &:hover {
        padding: 4px 8px;
        padding-inline: 2px;
        padding-right: 3px;
      }
    `}
`,b=t.span`
  display: inline-flex;
  padding: 4px 8px;
  background-color: #fdf2f8;

  ${e=>e.$active&&n`
      padding-inline-start: 2px;
    `}
`,x=t.span`
  display: inline-flex;
  padding: 4px 8px;
  background-color: #d1fae5;

  @media (min-width: 600px) {
    padding-right: 20px;
  }

  ${e=>e.$active&&n`
      &:hover {
        padding-inline: 2px;
      }
    `}
`,S=t.span`
  display: inline-flex;
  padding: 4px 8px;
  background-color: #fef3c7;

  @media (min-width: 600px) {
    padding-right: 20px;
  }

  ${e=>e.$active&&n`
      padding-inline: 2px;
    `}
`,C=()=>(0,c.jsxs)(`div`,{style:{display:`flex`,flexWrap:`wrap`,gap:8,padding:16,width:718},children:[(0,c.jsx)(l,{"data-state":`active`,children:`Active`}),(0,c.jsx)(l,{"data-state":`inactive`,children:`Inactive`}),(0,c.jsx)(u,{$interactive:!0,children:`Interactive`}),(0,c.jsx)(d,{$background:`#fed7aa`,children:`Icon`}),(0,c.jsx)(d,{children:`Plain icon`}),(0,c.jsx)(f,{children:`Enabled icon`}),(0,c.jsx)(f,{$disabled:!0,children:`Disabled icon`}),(0,c.jsx)(p,{$active:!0,tabIndex:0,children:`Focus alias`}),(0,c.jsx)(m,{$active:!0,tabIndex:0,children:`Alias default`}),(0,c.jsx)(h,{$active:!0,$color:`#2563eb`,children:`Alias order`}),(0,c.jsx)(g,{$active:!0,tabIndex:0,children:`Dual alias`}),(0,c.jsx)(_,{$active:!0,tabIndex:0,children:`Multi pseudo`}),(0,c.jsx)(v,{$enabled:!0,$visible:!0,$wide:!0,$image:!0,children:`Visible finite block`}),(0,c.jsx)(v,{$enabled:!0,children:`Hidden finite block`}),(0,c.jsx)(y,{$active:!0,children:`Logical padding hover`}),(0,c.jsx)(b,{$active:!0,children:`Logical side padding`}),(0,c.jsx)(x,{$active:!0,children:`Logical media padding`}),(0,c.jsx)(S,{$active:!0,children:`Logical scalar media padding`})]});export{C as App};