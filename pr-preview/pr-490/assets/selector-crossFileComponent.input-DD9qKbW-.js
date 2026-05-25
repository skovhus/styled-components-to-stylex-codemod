import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t}from"./index-CwP7pJhC.js";import{n,r,t as i}from"./cross-file-icon.styled-DSzxu38k.js";var a=e(),o=t.button`
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  background-color: #f0f0f0;
  cursor: pointer;
`,s=t(o)`
  gap: 8px;

  ${i} {
    width: 30px;
    height: 30px;
    transition: transform 0.2s;
  }

  &:hover ${i} {
    transform: rotate(180deg);
  }
`,c=t(o)`
  gap: 8px;

  ${i} {
    opacity: 0;
  }

  &:hover,
  &:focus-within {
    ${i} {
      opacity: 1;
    }
  }
`,l=t(o)`
  ${i} {
    background-color: transparent !important;
  }
`,u=t(o)`
  ${r} {
    color: #475569;
  }

  &:hover ${r} {
    color: #0f172a;
    text-decoration: underline;
  }
`,d=t.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid #cbd5e1;

  ${i} {
    width: 20px;
    height: 20px;
  }

  ${n} {
    color: #2563eb;
    text-decoration: none;
  }

  &:hover ${i} {
    transform: scale(1.2);
  }

  &:hover ${n} {
    color: #1d4ed8;
    text-decoration: underline;
  }
`;function f(){return(0,a.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16,width:760},children:[(0,a.jsx)(i,{}),(0,a.jsxs)(s,{children:[(0,a.jsx)(i,{}),`Hover`]}),(0,a.jsxs)(c,{children:[(0,a.jsx)(i,{}),`Hover or focus`]}),(0,a.jsxs)(l,{children:[(0,a.jsx)(i,{}),`Clone`]}),(0,a.jsx)(u,{children:(0,a.jsx)(r,{children:`Exported selector label`})}),(0,a.jsxs)(d,{children:[(0,a.jsx)(i,{}),(0,a.jsx)(n,{href:`#`,children:`External link`})]})]})}export{f as App};