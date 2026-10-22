import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{i as t}from"./styled-components.browser.esm-Dy4oaG3m.js";import{a as n,c as r,k as i}from"./helpers-daleu_Aj.js";var a=e(),o=t.button`
  padding: 0.5em 1em;
  background-color: ${n(`primaryColor`)};
  color: ${n(`textPrimary`)};
  border: 2px solid ${n(`bgSub`)};
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background-color: ${n(`bgSub`)};
  }
`,s=t.p`
  ${i()}
  max-width: 200px;
  font-size: 14px;
  color: ${n(`textSecondary`)};
`,c=t.div`
  ${r()}
  min-height: 100px;
  background-color: ${n(`bgBase`)};
  border: 1px solid ${n(`bgSub`)};
`,l=t.div`
  padding: 1em;
  background-color: ${n(`bgBase`)};
  border: 1px solid ${n(`bgSub`)};
  border-radius: 8px;
`,u=t.h3`
  ${i()}
  margin: 0 0 0.5em 0;
  color: ${n(`primaryColor`)};
  font-size: 18px;
`,d=()=>(0,a.jsx)(c,{children:(0,a.jsxs)(l,{children:[(0,a.jsx)(u,{children:`This is a very long title that should be truncated`}),(0,a.jsx)(s,{children:`This is some text content that will be truncated if it gets too long.`}),(0,a.jsx)(o,{children:`Click me`})]})});export{d as App};