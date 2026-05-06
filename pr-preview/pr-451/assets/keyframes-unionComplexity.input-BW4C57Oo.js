import{c as e,p as t,u as n}from"./index-Bh6V7bPe.js";var r=t(),i=n`
  0%, 40%, 100% {
    opacity: 1;
  }
  50%, 90% {
    opacity: 0.2;
  }
`,a=e.div`
  width: 8px;
  height: 16px;
  border-radius: 2px;
  background-color: blue;
  opacity: 0;
  animation: ${i} 2000ms infinite;
  animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  animation-delay: ${e=>e.$delay??1e3}ms;
`,o=e(a)`
  position: absolute;
  top: 11px;
  left: ${e=>e.$noPadding?`0`:`10px`};
`,s=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,gap:16,alignItems:`flex-start`},children:[(0,r.jsxs)(`div`,{children:[(0,r.jsx)(`p`,{children:`LoaderCaret:`}),(0,r.jsx)(a,{$delay:0})]}),(0,r.jsxs)(`div`,{style:{position:`relative`,height:40},children:[(0,r.jsx)(`p`,{children:`StyledLoaderCaret:`}),(0,r.jsx)(o,{$delay:500})]})]});export{s as App,a as LoaderCaret};