import{s as e,t}from"./jsx-runtime-D4ePz0Hl.js";import{m as n,u as r}from"./index-DPPpnsv9.js";import{O as i}from"./helpers-CNk7BKIG.js";/* empty css                          */var a=e(n(),1),o=t(),s=r.path.withConfig({shouldForwardProp:e=>!e.startsWith(`$`)})`
  transition-property: opacity;
  transition-duration: ${i(`slow`)};
  stroke: #bf4f74;
  stroke-width: ${e=>e.$width}px;
  fill: none;
`,c=()=>{let[e,t]=a.useState(!1);return a.useEffect(()=>{let e=window.setInterval(()=>t(e=>!e),650);return()=>window.clearInterval(e)},[]),(0,o.jsx)(`div`,{style:{fontFamily:`system-ui`},children:(0,o.jsx)(`svg`,{width:`140`,height:`60`,viewBox:`0 0 140 60`,style:{border:`1px solid #e0e0e0`,borderRadius:6,background:`white`},children:(0,o.jsx)(s,{d:`M10 30 L130 30`,style:{opacity:e?1:.2},$width:6})})})};export{c as App};