import{j as t,d as r}from"./index-DMuxzsKV.js";const s=r.g`
  opacity: ${e=>e.$state==="down"?0:1};
  transform-origin: 8px 4.5px; /* Top of stem - where it connects to arrow head */
  transition: opacity 150ms ease, transform 150ms ease;
  transform: ${e=>e.$state==="up"?"scaleY(3.27)":e.$state==="down"?"scaleY(0)":"scaleY(1)"};
`,a=()=>t.jsxs("svg",{width:"160",height:"60",viewBox:"0 0 160 60",children:[t.jsx(s,{$state:"up",children:t.jsx("rect",{x:"20",y:"10",width:"6",height:"40",fill:"black",rx:"2"})}),t.jsx(s,{$state:"down",children:t.jsx("rect",{x:"77",y:"10",width:"6",height:"40",fill:"black",rx:"2"})}),t.jsx(s,{$state:"both",children:t.jsx("rect",{x:"134",y:"10",width:"6",height:"40",fill:"black",rx:"2"})})]});export{a as App};
