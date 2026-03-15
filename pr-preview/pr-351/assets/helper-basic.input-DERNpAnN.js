import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-CvfJmPeC.js";import{C as n,a as r,s as i}from"./helpers-BtN0jKtV.js";var a=e(),o=t.button`
  padding: 0.5em 1em;
  background-color: ${r(`primaryColor`)};
  color: ${r(`textPrimary`)};
  border: 2px solid ${r(`bgSub`)};
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background-color: ${r(`bgSub`)};
  }
`,s=t.p`
  ${n()}
  max-width: 200px;
  font-size: 14px;
  color: ${r(`textSecondary`)};
`,c=t.div`
  ${i()}
  min-height: 100px;
  background-color: ${r(`bgBase`)};
  border: 1px solid ${r(`bgSub`)};
`,l=t.div`
  padding: 1em;
  background-color: ${r(`bgBase`)};
  border: 1px solid ${r(`bgSub`)};
  border-radius: 8px;
`,u=t.h3`
  ${n()}
  margin: 0 0 0.5em 0;
  color: ${r(`primaryColor`)};
  font-size: 18px;
`,d=()=>(0,a.jsx)(c,{children:(0,a.jsxs)(l,{children:[(0,a.jsx)(u,{children:`This is a very long title that should be truncated`}),(0,a.jsx)(s,{children:`This is some text content that will be truncated if it gets too long.`}),(0,a.jsx)(o,{children:`Click me`})]})});export{d as App};