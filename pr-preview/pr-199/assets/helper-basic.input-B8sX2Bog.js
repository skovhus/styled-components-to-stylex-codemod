import{j as r,a as t}from"./index-BM7VVAgN.js";import{h as i,c as o,t as e}from"./helpers-DDJAGtez.js";const n=t.button`
  padding: 0.5em 1em;
  background-color: ${o("primaryColor")};
  color: ${o("textPrimary")};
  border: 2px solid ${o("bgSub")};
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background-color: ${o("bgSub")};
  }
`,s=t.p`
  ${e()}
  max-width: 200px;
  font-size: 14px;
  color: ${o("textSecondary")};
`,d=t.div`
  ${i()}
  min-height: 100px;
  background-color: ${o("bgBase")};
  border: 1px solid ${o("bgSub")};
`,a=t.div`
  padding: 1em;
  background-color: ${o("bgBase")};
  border: 1px solid ${o("bgSub")};
  border-radius: 8px;
`,c=t.h3`
  ${e()}
  margin: 0 0 0.5em 0;
  color: ${o("primaryColor")};
  font-size: 18px;
`,b=()=>r.jsx(d,{children:r.jsxs(a,{children:[r.jsx(c,{children:"This is a very long title that should be truncated"}),r.jsx(s,{children:"This is some text content that will be truncated if it gets too long."}),r.jsx(n,{children:"Click me"})]})});export{b as App};
