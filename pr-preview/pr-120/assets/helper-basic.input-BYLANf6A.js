import{j as r,d as t}from"./index-DwHm5w_i.js";import{h as i,c as o,t as e}from"./helpers-DJ7I6cbn.js";const n=t.button`
  padding: 0.5em 1em;
  background-color: ${o("primaryColor")};
  color: ${o("textPrimary")};
  border: 2px solid ${o("bgSub")};
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background-color: ${o("bgSub")};
  }
`,d=t.p`
  ${e()}
  max-width: 200px;
  font-size: 14px;
  color: ${o("textSecondary")};
`,s=t.div`
  ${i()}
  min-height: 100px;
  background-color: ${o("bgBase")};
  border: 1px solid ${o("bgSub")};
`,c=t.div`
  padding: 1em;
  background-color: ${o("bgBase")};
  border: 1px solid ${o("bgSub")};
  border-radius: 8px;
`,a=t.h3`
  ${e()}
  margin: 0 0 0.5em 0;
  color: ${o("primaryColor")};
  font-size: 18px;
`,b=()=>r.jsx(s,{children:r.jsxs(c,{children:[r.jsx(a,{children:"This is a very long title that should be truncated"}),r.jsx(d,{children:"This is some text content that will be truncated if it gets too long."}),r.jsx(n,{children:"Click me"})]})});export{b as App};
