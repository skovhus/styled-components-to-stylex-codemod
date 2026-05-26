import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t,p as n}from"./index-x1lN72h9.js";n();var r=e(),i=44,a={sticky:8},o=t.div`
  height: ${e=>e.$gutter??i}px;
  margin-bottom: -${e=>e.$gutter??i}px;
  z-index: ${e=>e.$zIndex??a.sticky};
  background: papayawhip;
  color: black;
  padding: 8px;
`,s=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(o,{children:`Default gutter`}),(0,r.jsx)(o,{$gutter:80,$zIndex:3,children:`Custom gutter`})]});export{s as App,o as GutterBox};