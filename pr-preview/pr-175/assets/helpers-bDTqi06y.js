import{s as o}from"./index-DHeQ_gfE.js";const r=o`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,c=e=>t=>t.theme.color[e],l=()=>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,d=()=>`
  display: flex;
  align-items: center;
  justify-content: center;
`,h=()=>`
  background-image: linear-gradient(90deg, #ff6b6b, #5f6cff);
  color: transparent;
`,n=()=>"0.5px",p=e=>`
  display: -webkit-box;
  -webkit-line-clamp: ${e};
  -webkit-box-orient: vertical;
  overflow: hidden;
`,f=e=>`var(--speed-${e})`,m={modal:1e3},u={ui:{spacing:{small:"4px",medium:"8px"}}},w=e=>({normal:400,medium:500,bold:600})[e],g=e=>({small:"12px",medium:"14px",large:"16px"})[e],a=e=>`@media (max-width: ${e}px)`,x={phone:a(640)};function v(e){return t=>`${n()} solid ${t.theme.color[e]}`}function b(e){return`1px solid ${e}`}function k(e){return e}const s={isSafari:typeof navigator<"u"&&/^((?!chrome|android).)*safari/i.test(navigator.userAgent),isTouchDevice:typeof window<"u"&&"ontouchstart"in window&&!window.matchMedia("(hover: hover)").matches},y=()=>s.isTouchDevice?"active":"hover";function z(e){return s.isTouchDevice?e.active:e.hover}const $=(e,t)=>o`
  --fade-size: ${e}px;
  mask-image: linear-gradient(
    to bottom,
    ${t==="top"||t==="both"?"transparent, black var(--fade-size),":""}
    black,
    ${t==="bottom"||t==="both"?"black calc(100% - var(--fade-size)), transparent":""}
  );
`;export{s as B,r as T,n as a,v as b,c,g as d,f as e,w as f,h as g,d as h,u as i,y as j,x as k,p as l,b as m,z as n,$ as s,l as t,k as w,m as z};
