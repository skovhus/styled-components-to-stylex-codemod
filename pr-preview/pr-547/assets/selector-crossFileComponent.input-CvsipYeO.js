import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-B2DAr4lm.js";import{r as n,t as r}from"./cross-file-icon.styled-Czt09ryF.js";var i=e(),a=t.button`
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  background-color: #f0f0f0;
  cursor: pointer;
`,o=t(a)`
  gap: 8px;

  ${r} {
    width: 30px;
    height: 30px;
    transition: transform 0.2s;
  }

  &:hover ${r} {
    transform: rotate(180deg);
  }
`,s=t(a)`
  gap: 8px;

  ${r} {
    opacity: 0;
  }

  &:hover,
  &:focus-within {
    ${r} {
      opacity: 1;
    }
  }
`,c=t(a)`
  ${r} {
    background-color: transparent !important;
  }
`,l=t(a)`
  ${n} {
    color: #475569;
  }

  &:hover ${n} {
    color: #0f172a;
    text-decoration: underline;
  }
`;function u(){return(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16,width:620},children:[(0,i.jsx)(r,{}),(0,i.jsxs)(o,{children:[(0,i.jsx)(r,{}),`Hover`]}),(0,i.jsxs)(s,{children:[(0,i.jsx)(r,{}),`Hover or focus`]}),(0,i.jsxs)(c,{children:[(0,i.jsx)(r,{}),`Clone`]}),(0,i.jsx)(l,{children:(0,i.jsx)(n,{children:`Exported selector label`})})]})}export{u as App};