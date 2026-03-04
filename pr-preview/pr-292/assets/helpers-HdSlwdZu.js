import{s as a}from"./index-CHT9E2Cu.js";const m=a`
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
`,r=()=>"0.5px",b=e=>`
  display: -webkit-box;
  -webkit-line-clamp: ${e};
  -webkit-box-orient: vertical;
  overflow: hidden;
`,v=e=>`var(--speed-${e})`,$={modal:1e3,dialog:800},k={ui:{spacing:{small:"4px",medium:"8px"}}},z=e=>({normal:400,medium:500,bold:600})[e],y=e=>({small:"12px",medium:"14px",large:"16px"})[e],p=e=>`@media (max-width: ${e}px)`,S={phone:p(640)},B={phone:640};function C(e){return t=>`${r()} solid ${t.theme.color[e]}`}function T(e){return`${r()} solid ${e}`}function M(e){return`1px solid ${e}`}const I={cssWithAlpha(e,t){if(!e.startsWith("#"))return e;const n=e.slice(1),s=n.length===3?n.split("").map(o=>o+o).join(""):n;if(s.length!==6)return e;const c=Number.parseInt(s.slice(0,2),16),l=Number.parseInt(s.slice(2,4),16),d=Number.parseInt(s.slice(4,6),16),h=Math.min(1,Math.max(0,t));return`rgba(${c}, ${l}, ${d}, ${h})`}};function W(e){return e}const i={isSafari:typeof navigator<"u"&&/^((?!chrome|android).)*safari/i.test(navigator.userAgent),isTouchDevice:typeof window<"u"&&"ontouchstart"in window&&!window.matchMedia("(hover: hover)").matches},j=()=>i.isTouchDevice?"active":"hover";function D(e){return i.isTouchDevice?e.active:e.hover}const N=(e,t)=>a`
  --fade-size: ${e}px;
  mask-image: linear-gradient(
    to bottom,
    ${t==="top"||t==="both"?"transparent, black var(--fade-size),":""}
    black,
    ${t==="bottom"||t==="both"?"black calc(100% - var(--fade-size)), transparent":""}
  );
`,A=e=>({dark:"0 4px 12px rgba(0,0,0,0.3)",light:"0 2px 4px rgba(0,0,0,0.1)"})[e]??"none";export{i as B,I as C,m as T,r as a,C as b,f as c,T as d,z as e,w as f,x as g,y as h,v as i,A as j,M as k,k as l,j as m,B as n,S as o,b as p,D as q,N as s,g as t,W as w,$ as z};
