import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t,p as n}from"./index-CDAInV11.js";import{t as r}from"./framer-motion-C8JIL7SF.js";import{t as i}from"./user-avatar-cV0qp39F.js";n();var a=e(),o=t(r.div)`
  background: white;
  border-radius: ${e=>e.$isOpen?`8px`:`20px`};
  overflow: hidden;
`,s=t(i)`
  box-shadow: 0 0 0 2px ${e=>e.$highlightColor??`transparent`};
  border-radius: 50%;
`,c=t(r.img)`
  object-fit: contain;
  cursor: ${e=>e.$isDragging?`grabbing`:e.$isZoomable?`zoom-in`:`zoom-out`};
`,l=t(r.div)`
  width: ${e=>e.$svgWidth?`${e.$svgWidth}px`:`100%`};
  aspect-ratio: ${e=>f(e.$svgWidth,e.$svgHeight)};
  background: lavender;
  border: 2px solid purple;
`,u=()=>(0,a.jsxs)(`div`,{children:[(0,a.jsx)(o,{$isOpen:!0,initial:{height:40},animate:{height:200},style:{opacity:d},children:`Open content`}),(0,a.jsx)(o,{$isOpen:!1,initial:{height:40},animate:{height:40},children:`Closed`}),(0,a.jsx)(c,{$isDragging:!1,$isZoomable:!0,alt:`Zoomable`,src:`data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==`}),(0,a.jsx)(c,{$isDragging:!0,$isZoomable:!1,alt:`Dragging`,src:`data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==`}),(0,a.jsx)(l,{$svgWidth:160,$svgHeight:90,children:`16:9 iframe`}),(0,a.jsx)(l,{children:`Default iframe`}),(0,a.jsx)(s,{user:`Alice`,size:`small`,$highlightColor:`blue`}),(0,a.jsx)(s,{user:`Bob`,size:`tiny`})]}),d={get:()=>1};function f(e,t){return e&&t?`${e} / ${t}`:`16 / 9`}export{u as App};