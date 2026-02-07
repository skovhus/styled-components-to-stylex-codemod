import{d as e,j as t}from"./index-CNtKh6BA.js";import{A as r,a}from"./action-menu-divider-D_YDbQIF.js";const n=e.div`
  padding: 8px 12px;
  display: flex;
  align-items: center;
`;n.HEIGHT=42;n.PADDING=8;const d=e.button`
  padding: 8px 16px;
  background: gray;
`;d.HEIGHT=36;const i=e(d)`
  background: blue;
  color: white;
`;i.HEIGHT=d.HEIGHT;const p=e(r)`
  padding-left: 20px;
`,x=e(a)`
  padding-inline: 14px;
`;function u(){const o=n.HEIGHT,s=i.HEIGHT;return t.jsxs("div",{children:[t.jsx(n,{style:{height:o},children:"Item 1"}),t.jsx(i,{style:{height:s},children:"Click me"}),t.jsx(p,{text:"Divider"}),t.jsx(x,{title:"Header"})]})}export{u as App,x as CommandMenuGroupHeader,p as CommandMenuTextDivider,i as ExtendedButton,n as ListItem};
