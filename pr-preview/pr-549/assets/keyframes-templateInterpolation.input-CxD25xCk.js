import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{c as t,u as n}from"./index-B9WUESu_.js";var r=e(),i=40,a={travelDurationSeconds:1.8,pauseDurationSeconds:.45},o=a.travelDurationSeconds,s=Math.min(99.999,a.travelDurationSeconds/(a.travelDurationSeconds+a.pauseDurationSeconds)*100),c=t`
  from {
    transform: translateX(-${i}px);
  }
  to {
    transform: translateX(100%);
  }
`,l=n.div`
  display: inline-block;
  animation: ${c} ${o}s linear infinite;
  padding: 8px 12px;
`,u=t`
  0% {
    background-position: -${i}px 50%, 0 50%;
  }
  ${s}% {
    background-position: ${i}px 50%, 0 50%;
  }
  100% {
    background-position: ${i}px 50%, 0 50%;
  }
`,d=n.span`
  color: transparent;
  background-image:
    url("${e=>e.$imageUrl}"),
    linear-gradient(
      ${e=>e.theme.isDark?e.theme.color.labelBase:e.theme.color.labelMuted},
      ${e=>e.theme.isDark?e.theme.color.labelBase:e.theme.color.labelMuted}
    );
  background-clip: text;
  animation: ${u} ${o}s linear infinite;
`,f=()=>(0,r.jsxs)(`div`,{style:{display:`grid`,gap:8},children:[(0,r.jsx)(l,{children:`Hi`}),(0,r.jsx)(d,{$imageUrl:`/shine.png`,children:`Layered shimmer`})]});export{f as App};