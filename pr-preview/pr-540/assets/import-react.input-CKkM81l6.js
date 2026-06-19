import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-BCTsKAj3.js";var n=e(),r=t.div`
  padding: 16px;
  background: white;
`,i=t.button`
  padding: 8px 16px;
  background: blue;
  color: white;
`,a=t.span`
  color: ${e=>e.theme.color[e.variant]};
`,o=t.button`
  display: flex;
  align-items: center;
  background: ${e=>e.active?`navy`:`gray`};
  color: white;
`,s=t.button`
  display: inline-flex;
  align-items: center;
  background: ${e=>e.active?`purple`:`silver`};
  color: white;
`;function c(){return(0,n.jsxs)(`div`,{children:[(0,n.jsx)(o,{active:!0,children:`Active`}),(0,n.jsx)(o,{active:!1,children:`Inactive`}),(0,n.jsx)(s,{active:!0,onClick:()=>void 0,children:`Local active`})]})}export{c as App,i as Button,r as Card,o as ChoiceButton,a as ThemeSpan};