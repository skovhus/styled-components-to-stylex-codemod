import{f as e,s as t}from"./index-jXBjwzzU.js";import{t as n}from"./cross-file-icon.styled-CxP_a0RU.js";var r=e(),i=t.button`
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  background-color: #f0f0f0;
  cursor: pointer;
`,a=t(i)`
  gap: 8px;

  ${n} {
    width: 30px;
    height: 30px;
    transition: transform 0.2s;
  }

  &:hover ${n} {
    transform: rotate(180deg);
  }
`,o=t(i)`
  gap: 8px;

  ${n} {
    opacity: 0;
  }

  &:hover,
  &:focus-within {
    ${n} {
      opacity: 1;
    }
  }
`;function s(){return(0,r.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,r.jsx)(n,{}),(0,r.jsxs)(a,{children:[(0,r.jsx)(n,{}),`Hover`]}),(0,r.jsxs)(o,{children:[(0,r.jsx)(n,{}),`Hover or focus`]})]})}export{s as App};