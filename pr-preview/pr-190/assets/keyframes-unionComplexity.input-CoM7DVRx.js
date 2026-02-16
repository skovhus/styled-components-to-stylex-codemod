import{j as i,a as t,l as s}from"./index-228cqeYm.js";const o=s`
  0%, 40%, 100% {
    opacity: 1;
  }
  50%, 90% {
    opacity: 0.2;
  }
`,a=t.div`
  width: 8px;
  height: 16px;
  border-radius: 2px;
  background-color: blue;
  opacity: 0;
  animation: ${o} 2000ms infinite;
  animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  animation-delay: ${e=>e.$delay??1e3}ms;
`,n=t(a)`
  position: absolute;
  top: 11px;
  left: ${e=>e.$noPadding?"0":"10px"};
`,l=()=>i.jsxs("div",{style:{display:"flex",gap:16,alignItems:"flex-start"},children:[i.jsxs("div",{children:[i.jsx("p",{children:"LoaderCaret:"}),i.jsx(a,{$delay:0})]}),i.jsxs("div",{style:{position:"relative",height:40},children:[i.jsx("p",{children:"StyledLoaderCaret:"}),i.jsx(n,{$delay:500})]})]});export{l as App,a as LoaderCaret};
