import{u as e}from"./index-CyUUxAP6.js";var t=e`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,n=e=>t=>t.theme.color[e],r=()=>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,i=()=>`
  display: flex;
  align-items: center;
  justify-content: center;
`,a=()=>`
  background-image: linear-gradient(90deg, #ff6b6b, #5f6cff);
  color: transparent;
`,o=()=>`0.5px`,s=e=>`
  display: -webkit-box;
  -webkit-line-clamp: ${e};
  -webkit-box-orient: vertical;
  overflow: hidden;
`,c=e=>`var(--speed-${e})`,l={modal:1e3,popover:900,dialog:800},u={ui:{spacing:{small:`4px`,medium:`8px`,large:`16px`}}},d=e=>({normal:400,medium:500,bold:600})[e],f=e=>({small:`12px`,medium:`14px`,large:`16px`})[e],p=e=>`@media (max-width: ${e}px)`,m={phone:p(640),tablet:p(768)},h={phone:640,tablet:768};function g(e){return t=>`${o()} solid ${t.theme.color[e]}`}function _(e){return`${o()} solid ${e}`}function v(e){return`1px solid ${e}`}var y={cssWithAlpha(e,t){if(!e.startsWith(`#`))return e;let n=e.slice(1),r=n.length===3?n.split(``).map(e=>e+e).join(``):n;return r.length===6?`rgba(${Number.parseInt(r.slice(0,2),16)}, ${Number.parseInt(r.slice(2,4),16)}, ${Number.parseInt(r.slice(4,6),16)}, ${Math.min(1,Math.max(0,t))})`:e}};function b(e){return e?`rgba(255, 255, 255, 0.08)`:`rgba(0, 0, 0, 0.04)`}function x(e){return e}var S={isSafari:typeof navigator<`u`&&/^((?!chrome|android).)*safari/i.test(navigator.userAgent),isTouchDevice:typeof window<`u`&&`ontouchstart`in window&&!window.matchMedia(`(hover: hover)`).matches},C=()=>S.isTouchDevice?`active`:`hover`,w=()=>S.isTouchDevice?`active`:`hover`;function T(e){return S.isTouchDevice?e.active:e.hover}var E=(t,n)=>e`
  --fade-size: ${t}px;
  mask-image: linear-gradient(
    to bottom,
    ${n===`top`||n===`both`?`transparent, black var(--fade-size),`:``}
      black,
    ${n===`bottom`||n===`both`?`black calc(100% - var(--fade-size)), transparent`:``}
  );
`,D=e=>({dark:`0 4px 12px rgba(0,0,0,0.3)`,light:`0 2px 4px rgba(0,0,0,0.1)`})[e]??`none`;export{r as C,l as E,c as S,x as T,E as _,n as a,_ as b,f as c,a as d,C as f,h as g,m as h,v as i,d as l,T as m,y as n,u as o,w as p,t as r,i as s,S as t,b as u,D as v,s as w,o as x,g as y};