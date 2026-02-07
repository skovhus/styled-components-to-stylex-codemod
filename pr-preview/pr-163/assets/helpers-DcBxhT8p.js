import{l as a}from"./index-Cx_8Apnd.js";const r=a`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,i=e=>t=>t.theme.color[e],c=()=>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,l=()=>`
  display: flex;
  align-items: center;
  justify-content: center;
`,d=()=>`
  background-image: linear-gradient(90deg, #ff6b6b, #5f6cff);
  color: transparent;
`,s=()=>"0.5px",p=e=>`var(--speed-${e})`,f={modal:1e3},m={ui:{spacing:{small:"4px",medium:"8px"}}},u=e=>({normal:400,medium:500,bold:600})[e],x=e=>({small:"12px",medium:"14px",large:"16px"})[e],o=e=>`@media (max-width: ${e}px)`,g={phone:o(640)};function h(e){return t=>`${s()} solid ${t.theme.color[e]}`}function w(e){return`1px solid ${e}`}function b(e){return e}const v={isSafari:typeof navigator<"u"&&/^((?!chrome|android).)*safari/i.test(navigator.userAgent)},z=(e,t)=>a`
  --fade-size: ${e}px;
  mask-image: linear-gradient(
    to bottom,
    ${t==="top"||t==="both"?"transparent, black var(--fade-size),":""}
    black,
    ${t==="bottom"||t==="both"?"black calc(100% - var(--fade-size)), transparent":""}
  );
`;export{v as B,r as T,s as a,h as b,i as c,x as d,p as e,u as f,d as g,l as h,m as i,g as j,w as k,z as s,c as t,b as w,f as z};
