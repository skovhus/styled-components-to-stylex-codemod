import{b as o}from"./index-CpZ80fF0.js";const i=o`
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
`,a=()=>"0.5px",f=e=>`var(--speed-${e})`,p={modal:1e3},m={ui:{spacing:{small:"4px",medium:"8px"}}},u=e=>({normal:400,medium:500,bold:600})[e],g=e=>({small:"12px",medium:"14px",large:"16px"})[e],n=e=>`@media (max-width: ${e}px)`,w={phone:n(640)};function x(e){return t=>`${a()} solid ${t.theme.color[e]}`}function v(e){return`1px solid ${e}`}function b(e){return e}const s={isSafari:typeof navigator<"u"&&/^((?!chrome|android).)*safari/i.test(navigator.userAgent),isTouchDevice:typeof window<"u"&&"ontouchstart"in window&&!window.matchMedia("(hover: hover)").matches},z=()=>s.isTouchDevice?"active":"hover";function y(e){return s.isTouchDevice?e.active:e.hover}const $=(e,t)=>o`
  --fade-size: ${e}px;
  mask-image: linear-gradient(
    to bottom,
    ${t==="top"||t==="both"?"transparent, black var(--fade-size),":""}
    black,
    ${t==="bottom"||t==="both"?"black calc(100% - var(--fade-size)), transparent":""}
  );
`;export{s as B,i as T,a,x as b,c,g as d,f as e,u as f,h as g,d as h,m as i,z as j,w as k,v as l,y as m,$ as s,l as t,b as w,p as z};
