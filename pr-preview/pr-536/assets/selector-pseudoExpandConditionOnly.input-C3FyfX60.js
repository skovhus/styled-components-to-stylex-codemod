import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,m as n,u as r}from"./index-dt6iHj8I.js";import{g as i}from"./helpers-DTSOJoNj.js";n();var a=e(),o=r.div`
  padding: 8px;
  background-color: #f0f0f0;

  &:${i} {
    background-color: #e0e0e0;
    opacity: 0.9;
    transform: scale(1.02);
  }
`,s=r.div`
  padding: 12px;

  ${e=>e.$interactive?t`
          cursor: pointer;

          &:${i} {
            background-color: #e0f2fe;
          }
        `:void 0}
`;function c(){return(0,a.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,a.jsx)(o,{children:`Mixed: base + condition-only`}),(0,a.jsx)(s,{$interactive:!0,children:`Prop-gated condition-only`})]})}export{c as App};