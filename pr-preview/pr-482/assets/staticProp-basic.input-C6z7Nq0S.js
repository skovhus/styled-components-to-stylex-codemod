import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-Dla96no4.js";import{n as r,t as i}from"./action-menu-divider-ByNjOaK6.js";n();var a=e(),o=t.div`
  padding: 8px 12px;
  display: flex;
  align-items: center;
`;o.HEIGHT=42,o.PADDING=8;var s=t.button`
  padding: 8px 16px;
  background: gray;
`;s.HEIGHT=36;var c=t(s)`
  background: blue;
  color: white;
`;c.HEIGHT=s.HEIGHT;var l=t(r)`
  padding-left: 20px;
`,u=t(i)`
  padding-inline: 14px;
`;function d(){let e=o.HEIGHT,t=c.HEIGHT;return(0,a.jsxs)(`div`,{children:[(0,a.jsx)(o,{style:{height:e},children:`Item 1`}),(0,a.jsx)(c,{style:{height:t},children:`Click me`}),(0,a.jsx)(l,{text:`Divider`}),(0,a.jsx)(u,{title:`Header`})]})}export{d as App,u as CommandMenuGroupHeader,l as CommandMenuTextDivider,c as ExtendedButton,o as ListItem};