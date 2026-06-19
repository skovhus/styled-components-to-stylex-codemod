import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-Ey6_vfJ_.js";import{t as r}from"./framer-motion-BrKs1ZZC.js";import{t as i}from"./user-avatar-B2a_i2P7.js";t();var a=e(),o=n(r.div)`
  background: white;
  border-radius: ${e=>e.$isOpen?`8px`:`20px`};
  overflow: hidden;
`,s=n(i)`
  background-color: ${e=>e.$highlightColor??`transparent`};
  color: white;
  padding: 2px 4px;
`,c=n.div`
  box-shadow: 0 0 ${({$blur:e})=>e}px ${({$glowShadow:e})=>e};
`,l=n(r.img)`
  object-fit: contain;
  cursor: ${e=>e.$isDragging?`grabbing`:e.$isZoomable?`zoom-in`:`zoom-out`};
`,u=n(r.div)`
  width: ${e=>e.$svgWidth?`${e.$svgWidth}px`:`100%`};
  aspect-ratio: ${e=>p(e.$svgWidth,e.$svgHeight)};
  background: lavender;
  border: 2px solid purple;
`,d=()=>(0,a.jsxs)(`div`,{style:{width:512},children:[(0,a.jsx)(o,{$isOpen:!0,initial:{height:40},animate:{height:200},style:{opacity:f},children:`Open content`}),(0,a.jsx)(o,{$isOpen:!1,initial:{height:40},animate:{height:40},children:`Closed`}),(0,a.jsx)(l,{$isDragging:!1,$isZoomable:!0,alt:`Zoomable`,src:`data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==`}),(0,a.jsx)(l,{$isDragging:!0,$isZoomable:!1,alt:`Dragging`,src:`data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==`}),(0,a.jsx)(u,{$svgWidth:160,$svgHeight:90,children:`16:9 iframe`}),(0,a.jsx)(u,{children:`Default iframe`}),(0,a.jsx)(s,{user:`Alice`,size:`small`,$highlightColor:`blue`}),(0,a.jsx)(s,{user:`Bob`,size:`tiny`}),(0,a.jsx)(c,{$blur:4,$glowShadow:`rgba(0, 0, 0, 0.35)`,children:`Destructured shadow`})]}),f={get:()=>1};function p(e,t){return e&&t?`${e} / ${t}`:`16 / 9`}export{d as App};