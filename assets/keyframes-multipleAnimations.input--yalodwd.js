import{j as n,a,l as t}from"./index-Dpi_xjFz.js";const i=t`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`,s=t`
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
`,e=t`
  0% {
    transform: scale(0.5);
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
`,o=a.div`
  animation: ${i} 0.6s cubic-bezier(0.165, 0.84, 0.44, 1) both;
`,r=a.div`
  animation: ${i} 0.3s ease-out, ${s} 0.5s ease-out;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`,d=a.div`
  animation-name: ${e};
  animation-duration: 0.6s;
  animation-timing-function: cubic-bezier(0.68, -0.55, 0.265, 1.55);
  animation-fill-mode: both;
`,m=a.div`
  animation: ${i} 0.3s ease-out 0s, ${s} 0.5s ease-out 0.3s;
`,c=a.div`
  animation: ${i} 1s steps(4, end) 200ms 3 alternate both running;
`,l=a.div`
  animation: ${i} 500ms ease-in 0s 1 normal both paused,
    ${s} 700ms ease-out 100ms infinite reverse forwards paused;
`,x=()=>n.jsxs("div",{children:[n.jsx(o,{children:"Fade in"}),n.jsx(r,{children:"Animated Card"}),n.jsx(d,{children:"Bounce In"}),n.jsx(m,{children:"Sequential"}),n.jsx(c,{children:"Full Animation"}),n.jsx(l,{children:"Mixed States"})]});export{x as App};
