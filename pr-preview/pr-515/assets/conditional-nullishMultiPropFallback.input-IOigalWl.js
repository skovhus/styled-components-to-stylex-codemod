import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t,p as n}from"./index-6HX-T86K.js";n();var r=e(),i=44,a={sticky:8},o=t.div`
  height: ${e=>e.$gutter??i}px;
  margin-bottom: -${e=>e.$gutter??i}px;
  z-index: ${e=>e.$zIndex??a.sticky};
  background: papayawhip;
  color: black;
  padding: 8px;
`,s=t.div`
  position: relative;
  z-index: ${e=>e.$zIndex??`auto`};
  background: lavender;
  color: black;
  padding: 8px;
`,c=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(o,{children:`Default gutter`}),(0,r.jsx)(o,{$gutter:80,$zIndex:3,children:`Custom gutter`}),(0,r.jsx)(s,{children:`Auto layer`}),(0,r.jsx)(s,{$zIndex:2,children:`Numeric layer`})]});export{c as App,o as GutterBox};