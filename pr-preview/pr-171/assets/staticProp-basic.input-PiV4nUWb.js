import{j as t,a as e}from"./index-B6Sa1gW2.js";import{A as r,a}from"./action-menu-divider-if1UJuIC.js";const n=e.div`
  padding: 8px 12px;
  display: flex;
  align-items: center;
`;n.HEIGHT=42;n.PADDING=8;const o=e.button`
  padding: 8px 16px;
  background: gray;
`;o.HEIGHT=36;const i=e(o)`
  background: blue;
  color: white;
`;i.HEIGHT=o.HEIGHT;const p=e(r)`
  padding-left: 20px;
`,x=e(a)`
  padding-inline: 14px;
`;function u(){const d=n.HEIGHT,s=i.HEIGHT;return t.jsxs("div",{children:[t.jsx(n,{style:{height:d},children:"Item 1"}),t.jsx(i,{style:{height:s},children:"Click me"}),t.jsx(p,{text:"Divider"}),t.jsx(x,{title:"Header"})]})}export{u as App,x as CommandMenuGroupHeader,p as CommandMenuTextDivider,i as ExtendedButton,n as ListItem};
