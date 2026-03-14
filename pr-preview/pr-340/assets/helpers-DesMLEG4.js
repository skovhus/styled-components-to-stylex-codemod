import{s as r}from"./index-M8P1SD-x.js";const g=r`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,m=e=>t=>t.theme.color[e],f=()=>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,w=()=>`
  display: flex;
  align-items: center;
  justify-content: center;
`,b=()=>`
  background-image: linear-gradient(90deg, #ff6b6b, #5f6cff);
  color: transparent;
`,i=()=>"0.5px",x=e=>`
  display: -webkit-box;
  -webkit-line-clamp: ${e};
  -webkit-box-orient: vertical;
  overflow: hidden;
`,v=e=>`var(--speed-${e})`,$={modal:1e3,dialog:800},k={ui:{spacing:{small:"4px",medium:"8px"}}},z=e=>({normal:400,medium:500,bold:600})[e],y=e=>({small:"12px",medium:"14px",large:"16px"})[e],p=e=>`@media (max-width: ${e}px)`,C={phone:p(640)},S={phone:640};function T(e){return t=>`${i()} solid ${t.theme.color[e]}`}function B(e){return`${i()} solid ${e}`}function M(e){return`1px solid ${e}`}const D={cssWithAlpha(e,t){if(!e.startsWith("#"))return e;const n=e.slice(1),s=n.length===3?n.split("").map(a=>a+a).join(""):n;if(s.length!==6)return e;const c=Number.parseInt(s.slice(0,2),16),l=Number.parseInt(s.slice(2,4),16),h=Number.parseInt(s.slice(4,6),16),d=Math.min(1,Math.max(0,t));return`rgba(${c}, ${l}, ${h}, ${d})`}};function I(e){return e?"rgba(255, 255, 255, 0.08)":"rgba(0, 0, 0, 0.04)"}function W(e){return e}const o={isSafari:typeof navigator<"u"&&/^((?!chrome|android).)*safari/i.test(navigator.userAgent),isTouchDevice:typeof window<"u"&&"ontouchstart"in window&&!window.matchMedia("(hover: hover)").matches},j=()=>o.isTouchDevice?"active":"hover",N=()=>o.isTouchDevice?"active":"hover";function A(e){return o.isTouchDevice?e.active:e.hover}const P=(e,t)=>r`
  --fade-size: ${e}px;
  mask-image: linear-gradient(
    to bottom,
    ${t==="top"||t==="both"?"transparent, black var(--fade-size),":""}
    black,
    ${t==="bottom"||t==="both"?"black calc(100% - var(--fade-size)), transparent":""}
  );
`,q=e=>({dark:"0 4px 12px rgba(0,0,0,0.3)",light:"0 2px 4px rgba(0,0,0,0.1)"})[e]??"none";export{o as B,D as C,g as T,i as a,B as b,m as c,T as d,b as e,y as f,I as g,P as h,w as i,z as j,v as k,q as l,M as m,k as n,j as o,S as p,x as q,N as r,C as s,f as t,A as u,W as w,$ as z};
