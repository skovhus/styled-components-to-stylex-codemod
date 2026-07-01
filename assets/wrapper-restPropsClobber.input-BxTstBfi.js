import{s as e,t}from"./jsx-runtime-D4ePz0Hl.js";import{m as n,u as r}from"./index-CJRCtd4b.js";var i=e(n(),1),a=t(),o=r.ul`
  position: relative;
  margin: 0;
  background-color: #f5f5f5;
  height: 100%;
  outline: none;
`,s=r.ul`
  position: relative;
  margin: 0;
  background-color: #eef8ff;
  height: 100%;
  outline: none;
`,c=r.ul`
  position: relative;
  margin: 0;
  background-color: #f2ffee;
  height: 100%;
  outline: none;
`;function l(e){let{ref:t,...n}=e;return(0,a.jsx)(o,{ref:t,...n})}function u(e){let{ref:t,...n}=e;return(0,a.jsx)(s,{ref:t,...n})}function d(e){let{ref:t,...n}=e;return(0,a.jsx)(c,{ref:t,...n})}function f(e){let t=i.useRef(null),n={className:`virtual-list-inner`,style:{height:400,width:`100%`,position:`relative`,overflow:`visible`}};return(0,a.jsxs)(`div`,{style:{height:200,overflow:`auto`,border:`2px solid #333`},children:[(0,a.jsx)(l,{ref:t,...n,children:e.children}),(0,a.jsx)(u,{ref:t,...n,children:e.children}),(0,a.jsx)(d,{ref:t,...n,children:e.children})]})}var p=()=>(0,a.jsx)(`div`,{style:{padding:16},children:(0,a.jsx)(f,{children:Array.from({length:20},(e,t)=>(0,a.jsxs)(`li`,{style:{padding:`8px 12px`,borderBottom:`1px solid #ddd`},children:[`Item `,t+1]},t))})});export{p as App};