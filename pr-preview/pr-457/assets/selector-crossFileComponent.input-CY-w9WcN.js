import{c as e,p as t}from"./index-pB-WyW-a.js";import{r as n,t as r}from"./cross-file-icon.styled-D6kTiUw-.js";var i=t(),a=e.button`
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  background-color: #f0f0f0;
  cursor: pointer;
`,o=e(a)`
  gap: 8px;

  ${r} {
    width: 30px;
    height: 30px;
    transition: transform 0.2s;
  }

  &:hover ${r} {
    transform: rotate(180deg);
  }
`,s=e(a)`
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
`,c=e(a)`
  ${r} {
    background-color: transparent !important;
  }
`,l=e(a)`
  ${n} {
    color: #475569;
  }

  &:hover ${n} {
    color: #0f172a;
    text-decoration: underline;
  }
`;function u(){return(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16,width:620},children:[(0,i.jsx)(r,{}),(0,i.jsxs)(o,{children:[(0,i.jsx)(r,{}),`Hover`]}),(0,i.jsxs)(s,{children:[(0,i.jsx)(r,{}),`Hover or focus`]}),(0,i.jsxs)(c,{children:[(0,i.jsx)(r,{}),`Clone`]}),(0,i.jsx)(l,{children:(0,i.jsx)(n,{children:`Exported selector label`})})]})}export{u as App};