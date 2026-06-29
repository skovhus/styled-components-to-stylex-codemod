import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-DLb43E6M.js";import{n as r,t as i}from"./action-menu-divider-CdNvz_zH.js";t();var a=e(),o=n.div`
  padding: 8px 12px;
  display: flex;
  align-items: center;
`;o.HEIGHT=42,o.PADDING=8;var s=n.button`
  padding: 8px 16px;
  background: gray;
`;s.HEIGHT=36;var c=n(s)`
  background: blue;
  color: white;
`;c.HEIGHT=s.HEIGHT;var l=n(r)`
  padding-left: 20px;
`,u=n(i)`
  padding-inline: 14px;
`;function d(){let e=o.HEIGHT,t=c.HEIGHT;return(0,a.jsxs)(`div`,{children:[(0,a.jsx)(o,{style:{height:e},children:`Item 1`}),(0,a.jsx)(c,{style:{height:t},children:`Click me`}),(0,a.jsx)(l,{text:`Divider`}),(0,a.jsx)(u,{title:`Header`})]})}export{d as App,u as CommandMenuGroupHeader,l as CommandMenuTextDivider,c as ExtendedButton,o as ListItem};