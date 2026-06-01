import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t,p as n}from"./index-C7PvTXxr.js";import{a as r}from"./helpers-CTvE2yYk.js";import{t as i}from"./framer-motion-B95bNfBg.js";import{t as a}from"./user-avatar-BQ1VhG29.js";n();var o=e(),s=t(i.div)`
  background: white;
  border-radius: ${e=>e.$isOpen?`8px`:`20px`};
  overflow: hidden;
`,c=t(a)`
  box-shadow: 0 0 0 2px ${e=>e.$highlightColor??`transparent`};
  border-radius: 50%;
`,l=t(a)`
  box-shadow:
    0 0 0 1px ${r(`bgBase`)},
    0 0 0 2px ${e=>e.$highlightColor??`transparent`},
    0 0 0 3px ${e=>e.$highlightColor?e.theme.color.bgBase:`transparent`};
  border-radius: 50%;
  margin: 2px;
  transition: box-shadow 0.3s ease-in-out;
`,u=t(i.img)`
  object-fit: contain;
  cursor: ${e=>e.$isDragging?`grabbing`:e.$isZoomable?`zoom-in`:`zoom-out`};
`,d=t(i.div)`
  width: ${e=>e.$svgWidth?`${e.$svgWidth}px`:`100%`};
  aspect-ratio: ${e=>m(e.$svgWidth,e.$svgHeight)};
  background: lavender;
  border: 2px solid purple;
`,f=()=>(0,o.jsxs)(`div`,{children:[(0,o.jsx)(s,{$isOpen:!0,initial:{height:40},animate:{height:200},style:{opacity:p},children:`Open content`}),(0,o.jsx)(s,{$isOpen:!1,initial:{height:40},animate:{height:40},children:`Closed`}),(0,o.jsx)(u,{$isDragging:!1,$isZoomable:!0,alt:`Zoomable`,src:`data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==`}),(0,o.jsx)(u,{$isDragging:!0,$isZoomable:!1,alt:`Dragging`,src:`data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==`}),(0,o.jsx)(d,{$svgWidth:160,$svgHeight:90,children:`16:9 iframe`}),(0,o.jsx)(d,{children:`Default iframe`}),(0,o.jsx)(c,{user:`Alice`,size:`small`,$highlightColor:`blue`}),(0,o.jsx)(c,{user:`Bob`,size:`tiny`}),(0,o.jsx)(l,{user:`Carol`,size:`small`,$highlightColor:`green`}),(0,o.jsx)(l,{user:`Dave`,size:`tiny`})]}),p={get:()=>1};function m(e,t){return e&&t?`${e} / ${t}`:`16 / 9`}export{f as App};