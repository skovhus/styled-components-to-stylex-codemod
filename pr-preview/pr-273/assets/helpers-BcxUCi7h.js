import{s as o}from"./index-CBphIOKd.js";const u=o`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,f=e=>t=>t.theme.color[e],g=()=>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,w=()=>`
  display: flex;
  align-items: center;
  justify-content: center;
`,x=()=>`
  background-image: linear-gradient(90deg, #ff6b6b, #5f6cff);
  color: transparent;
`,h=()=>"0.5px",b=e=>`
  display: -webkit-box;
  -webkit-line-clamp: ${e};
  -webkit-box-orient: vertical;
  overflow: hidden;
`,v=e=>`var(--speed-${e})`,$={modal:1e3},k={ui:{spacing:{small:"4px",medium:"8px"}}},z=e=>({normal:400,medium:500,bold:600})[e],y=e=>({small:"12px",medium:"14px",large:"16px"})[e],p=e=>`@media (max-width: ${e}px)`,C={phone:p(640)};function S(e){return t=>`${h()} solid ${t.theme.color[e]}`}function T(e){return`1px solid ${e}`}const M={cssWithAlpha(e,t){if(!e.startsWith("#"))return e;const n=e.slice(1),s=n.length===3?n.split("").map(a=>a+a).join(""):n;if(s.length!==6)return e;const i=Number.parseInt(s.slice(0,2),16),c=Number.parseInt(s.slice(2,4),16),l=Number.parseInt(s.slice(4,6),16),d=Math.min(1,Math.max(0,t));return`rgba(${i}, ${c}, ${l}, ${d})`}};function B(e){return e}const r={isSafari:typeof navigator<"u"&&/^((?!chrome|android).)*safari/i.test(navigator.userAgent),isTouchDevice:typeof window<"u"&&"ontouchstart"in window&&!window.matchMedia("(hover: hover)").matches},I=()=>r.isTouchDevice?"active":"hover";function W(e){return r.isTouchDevice?e.active:e.hover}const j=(e,t)=>o`
  --fade-size: ${e}px;
  mask-image: linear-gradient(
    to bottom,
    ${t==="top"||t==="both"?"transparent, black var(--fade-size),":""}
    black,
    ${t==="bottom"||t==="both"?"black calc(100% - var(--fade-size)), transparent":""}
  );
`,D=e=>({dark:"0 4px 12px rgba(0,0,0,0.3)",light:"0 2px 4px rgba(0,0,0,0.1)"})[e]??"none";export{r as B,M as C,u as T,h as a,S as b,f as c,z as d,y as e,w as f,x as g,v as h,D as i,T as j,k,I as l,C as m,b as n,W as o,j as s,g as t,B as w,$ as z};
