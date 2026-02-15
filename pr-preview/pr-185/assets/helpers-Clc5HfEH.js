import{b as a}from"./index-DXW5E0kP.js";const c=a`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,l=e=>t=>t.theme.color[e],d=()=>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,f=()=>`
  display: flex;
  align-items: center;
  justify-content: center;
`,p=()=>`
  background-image: linear-gradient(90deg, #ff6b6b, #5f6cff);
  color: transparent;
`,s=()=>"0.5px",m=e=>`var(--speed-${e})`,h={modal:1e3},u={ui:{spacing:{small:"4px",medium:"8px"}}},g=e=>({normal:400,medium:500,bold:600})[e],x=e=>({small:"12px",medium:"14px",large:"16px"})[e],o=e=>`@media (max-width: ${e}px)`,b={phone:o(640)};function w(e){return t=>`${s()} solid ${t.theme.color[e]}`}function v(e){return`1px solid ${e}`}function z(e){return e}const n={isSafari:typeof navigator<"u"&&/^((?!chrome|android).)*safari/i.test(navigator.userAgent)},r=n.isSafari?"active":"hover";function $(e){return e[r]}const k=(e,t)=>a`
  --fade-size: ${e}px;
  mask-image: linear-gradient(
    to bottom,
    ${t==="top"||t==="both"?"transparent, black var(--fade-size),":""}
    black,
    ${t==="bottom"||t==="both"?"black calc(100% - var(--fade-size)), transparent":""}
  );
`;export{n as B,c as T,s as a,w as b,l as c,x as d,m as e,g as f,p as g,f as h,u as i,b as j,r as k,v as l,$ as m,k as s,d as t,z as w,h as z};
