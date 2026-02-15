import{b as o}from"./index-CGfeZ_F8.js";const c=o`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,l=e=>t=>t.theme.color[e],d=()=>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,h=()=>`
  display: flex;
  align-items: center;
  justify-content: center;
`,p=()=>`
  background-image: linear-gradient(90deg, #ff6b6b, #5f6cff);
  color: transparent;
`,a=()=>"0.5px",f=e=>`var(--speed-${e})`,u={modal:1e3},m={ui:{spacing:{small:"4px",medium:"8px"}}},g=e=>({normal:400,medium:500,bold:600})[e],w=e=>({small:"12px",medium:"14px",large:"16px"})[e],n=e=>`@media (max-width: ${e}px)`,x={phone:n(640)};function v(e){return t=>`${a()} solid ${t.theme.color[e]}`}function b(e){return`1px solid ${e}`}function z(e){return e}const s={isSafari:typeof navigator<"u"&&/^((?!chrome|android).)*safari/i.test(navigator.userAgent),isPureTouchDevice:typeof window<"u"&&"ontouchstart"in window&&!window.matchMedia("(hover: hover)").matches},r=s.isPureTouchDevice?"active":"hover",y=r;function $(e){return s.isPureTouchDevice?e.active:e.hover}const k=(e,t)=>o`
  --fade-size: ${e}px;
  mask-image: linear-gradient(
    to bottom,
    ${t==="top"||t==="both"?"transparent, black var(--fade-size),":""}
    black,
    ${t==="bottom"||t==="both"?"black calc(100% - var(--fade-size)), transparent":""}
  );
`;export{s as B,c as T,a,v as b,l as c,w as d,f as e,g as f,p as g,h,m as i,r as j,y as k,x as l,b as m,$ as n,k as s,d as t,z as w,u as z};
