import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t,p as n}from"./index-B4_7tITx.js";import{a as r}from"./helpers-oQ4j6nYp.js";import{t as i}from"./framer-motion-CVq1t_R-.js";import{t as a}from"./user-avatar-BXI7LyUf.js";n();var o=e(),s=t(i.div)`
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
`,u=t.div`
  box-shadow: 0 0 ${({$blur:e})=>e}px ${({$glowShadow:e})=>e};
`,d=t(i.img)`
  object-fit: contain;
  cursor: ${e=>e.$isDragging?`grabbing`:e.$isZoomable?`zoom-in`:`zoom-out`};
`,f=t(i.div)`
  width: ${e=>e.$svgWidth?`${e.$svgWidth}px`:`100%`};
  aspect-ratio: ${e=>h(e.$svgWidth,e.$svgHeight)};
  background: lavender;
  border: 2px solid purple;
`,p=()=>(0,o.jsxs)(`div`,{children:[(0,o.jsx)(s,{$isOpen:!0,initial:{height:40},animate:{height:200},style:{opacity:m},children:`Open content`}),(0,o.jsx)(s,{$isOpen:!1,initial:{height:40},animate:{height:40},children:`Closed`}),(0,o.jsx)(d,{$isDragging:!1,$isZoomable:!0,alt:`Zoomable`,src:`data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==`}),(0,o.jsx)(d,{$isDragging:!0,$isZoomable:!1,alt:`Dragging`,src:`data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==`}),(0,o.jsx)(f,{$svgWidth:160,$svgHeight:90,children:`16:9 iframe`}),(0,o.jsx)(f,{children:`Default iframe`}),(0,o.jsx)(c,{user:`Alice`,size:`small`,$highlightColor:`blue`}),(0,o.jsx)(c,{user:`Bob`,size:`tiny`}),(0,o.jsx)(l,{user:`Carol`,size:`small`,$highlightColor:`green`}),(0,o.jsx)(l,{user:`Dave`,size:`tiny`}),(0,o.jsx)(u,{$blur:4,$glowShadow:`rgba(0, 0, 0, 0.35)`,children:`Destructured shadow`})]}),m={get:()=>1};function h(e,t){return e&&t?`${e} / ${t}`:`16 / 9`}export{p as App};