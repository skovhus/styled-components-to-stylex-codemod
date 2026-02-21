import{j as t,c as e}from"./index-FP_Cx-M0.js";import{A as r,a}from"./action-menu-divider-BjsrZ6QZ.js";const n=e.div`
  padding: 8px 12px;
  display: flex;
  align-items: center;
`;n.HEIGHT=42;n.PADDING=8;const o=e.button`
  padding: 8px 16px;
  background: gray;
`;o.HEIGHT=36;const i=e(o)`
  background: blue;
  color: white;
`;i.HEIGHT=o.HEIGHT;const c=e(r)`
  padding-left: 20px;
`,p=e(a)`
  padding-inline: 14px;
`;function u(){const d=n.HEIGHT,s=i.HEIGHT;return t.jsxs("div",{children:[t.jsx(n,{style:{height:d},children:"Item 1"}),t.jsx(i,{style:{height:s},children:"Click me"}),t.jsx(c,{text:"Divider"}),t.jsx(p,{title:"Header"})]})}export{u as App,p as CommandMenuGroupHeader,c as CommandMenuTextDivider,i as ExtendedButton,n as ListItem};
