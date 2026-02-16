import{b as o}from"./index-GyHoMw1Y.js";const u=o`
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
`,d=()=>"0.5px",b=e=>`var(--speed-${e})`,v={modal:1e3},$={ui:{spacing:{small:"4px",medium:"8px"}}},z=e=>({normal:400,medium:500,bold:600})[e],y=e=>({small:"12px",medium:"14px",large:"16px"})[e],m=e=>`@media (max-width: ${e}px)`,k={phone:m(640)};function C(e){return t=>`${d()} solid ${t.theme.color[e]}`}function S(e){return`1px solid ${e}`}const T={cssWithAlpha(e,t){if(!e.startsWith("#"))return e;const n=e.slice(1),s=n.length===3?n.split("").map(a=>a+a).join(""):n;if(s.length!==6)return e;const i=Number.parseInt(s.slice(0,2),16),c=Number.parseInt(s.slice(2,4),16),l=Number.parseInt(s.slice(4,6),16),h=Math.min(1,Math.max(0,t));return`rgba(${i}, ${c}, ${l}, ${h})`}};function B(e){return e}const r={isSafari:typeof navigator<"u"&&/^((?!chrome|android).)*safari/i.test(navigator.userAgent),isTouchDevice:typeof window<"u"&&"ontouchstart"in window&&!window.matchMedia("(hover: hover)").matches},I=()=>r.isTouchDevice?"active":"hover";function M(e){return r.isTouchDevice?e.active:e.hover}const W=(e,t)=>o`
  --fade-size: ${e}px;
  mask-image: linear-gradient(
    to bottom,
    ${t==="top"||t==="both"?"transparent, black var(--fade-size),":""}
    black,
    ${t==="bottom"||t==="both"?"black calc(100% - var(--fade-size)), transparent":""}
  );
`;export{r as B,T as C,u as T,d as a,C as b,f as c,y as d,b as e,z as f,x as g,w as h,S as i,$ as j,I as k,k as l,M as m,W as s,g as t,B as w,v as z};
