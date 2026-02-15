import{b as o}from"./index-BMBcwCmH.js";const c=o`
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
`,a=()=>"0.5px",f=e=>`var(--speed-${e})`,m={modal:1e3},u={ui:{spacing:{small:"4px",medium:"8px"}}},g=e=>({normal:400,medium:500,bold:600})[e],w=e=>({small:"12px",medium:"14px",large:"16px"})[e],s=e=>`@media (max-width: ${e}px)`,x={phone:s(640)};function v(e){return t=>`${a()} solid ${t.theme.color[e]}`}function b(e){return`1px solid ${e}`}function z(e){return e}const n={isSafari:typeof navigator<"u"&&/^((?!chrome|android).)*safari/i.test(navigator.userAgent),isPureTouchDevice:typeof window<"u"&&"ontouchstart"in window&&!window.matchMedia("(hover: hover)").matches},r=n.isPureTouchDevice?"active":"hover",$=r,k=(e,t)=>o`
  --fade-size: ${e}px;
  mask-image: linear-gradient(
    to bottom,
    ${t==="top"||t==="both"?"transparent, black var(--fade-size),":""}
    black,
    ${t==="bottom"||t==="both"?"black calc(100% - var(--fade-size)), transparent":""}
  );
`;export{n as B,c as T,a,v as b,l as c,w as d,f as e,g as f,p as g,h,u as i,r as j,$ as k,x as l,b as m,k as s,d as t,z as w,m as z};
