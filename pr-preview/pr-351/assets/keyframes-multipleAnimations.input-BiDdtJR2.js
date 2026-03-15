import"./react-D4cBbUL-.js";import{f as e,l as t,s as n}from"./index-CvfJmPeC.js";var r=e(),i=t`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`,a=t`
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
`,o=t`
  0% {
    transform: scale(0.5);
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
`,s=n.div`
  animation: ${i} 0.6s cubic-bezier(0.165, 0.84, 0.44, 1) both;
`,c=n.div`
  animation: ${i} 0.3s ease-out, ${a} 0.5s ease-out;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`,l=n.div`
  animation-name: ${o};
  animation-duration: 0.6s;
  animation-timing-function: cubic-bezier(0.68, -0.55, 0.265, 1.55);
  animation-fill-mode: both;
`,u=n.div`
  animation: ${i} 0.3s ease-out 0s, ${a} 0.5s ease-out 0.3s;
`,d=n.div`
  animation: ${i} 1s steps(4, end) 200ms 3 alternate both running;
`,f=n.div`
  animation: ${i} 500ms ease-in 0s 1 normal both paused,
    ${a} 700ms ease-out 100ms infinite reverse forwards paused;
`,p=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(s,{children:`Fade in`}),(0,r.jsx)(c,{children:`Animated Card`}),(0,r.jsx)(l,{children:`Bounce In`}),(0,r.jsx)(u,{children:`Sequential`}),(0,r.jsx)(d,{children:`Full Animation`}),(0,r.jsx)(f,{children:`Mixed States`})]});export{p as App};