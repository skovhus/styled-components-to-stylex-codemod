import{R as i,j as e,c as n}from"./index-FP_Cx-M0.js";/* empty css                          */import{e as a}from"./helpers-BIUw4OQN.js";const d=n.path.withConfig({shouldForwardProp:t=>!t.startsWith("$")})`
  transition-property: opacity;
  transition-duration: ${a("slow")};
  stroke: #bf4f74;
  stroke-width: ${t=>t.$width}px;
  fill: none;
`,h=()=>{const[t,o]=i.useState(!1);return i.useEffect(()=>{const s=window.setInterval(()=>o(r=>!r),650);return()=>window.clearInterval(s)},[]),e.jsx("div",{style:{fontFamily:"system-ui"},children:e.jsx("svg",{width:"140",height:"60",viewBox:"0 0 140 60",style:{border:"1px solid #e0e0e0",borderRadius:6,background:"white"},children:e.jsx(d,{d:"M10 30 L130 30",style:{opacity:t?1:.2},$width:6})})})};export{h as App};
