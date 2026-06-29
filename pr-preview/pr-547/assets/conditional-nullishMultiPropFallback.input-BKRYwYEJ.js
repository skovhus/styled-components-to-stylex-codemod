import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-DRPegeCN.js";t();var r=e(),i=44,a={sticky:8},o=n.div`
  height: ${e=>e.$gutter??i}px;
  margin-bottom: -${e=>e.$gutter??i}px;
  z-index: ${e=>e.$zIndex??a.sticky};
  background: papayawhip;
  color: black;
  padding: 8px;
`,s=n.div`
  position: relative;
  z-index: ${e=>e.$zIndex??`auto`};
  background: lavender;
  color: black;
  padding: 8px;
`,c=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(o,{children:`Default gutter`}),(0,r.jsx)(o,{$gutter:80,$zIndex:3,children:`Custom gutter`}),(0,r.jsx)(s,{children:`Auto layer`}),(0,r.jsx)(s,{$zIndex:2,children:`Numeric layer`})]});export{c as App,o as GutterBox};