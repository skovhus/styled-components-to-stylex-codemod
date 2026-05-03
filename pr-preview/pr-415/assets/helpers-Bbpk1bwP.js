import{u as e}from"./index-B5-MZ4Ct.js";var t=e`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,n=e=>t=>t.theme.color[e];function r(e,t){return t===`theme`?t=>t.theme.color[e]:e===`bgSub`?`#009900`:`#990000`}var i=()=>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,a=()=>`
  display: flex;
  align-items: center;
  justify-content: center;
`,o=()=>`
  background-image: linear-gradient(90deg, #ff6b6b, #5f6cff);
  color: transparent;
`,s=()=>`0.5px`,c=e=>`
  display: -webkit-box;
  -webkit-line-clamp: ${e};
  -webkit-box-orient: vertical;
  overflow: hidden;
`,l=e=>`var(--speed-${e})`,u={modal:1e3,popover:900,dialog:800},d={ui:{spacing:{small:`4px`,medium:`8px`,large:`16px`}}},f=e=>({normal:400,medium:500,bold:600})[e],p=e=>({small:`12px`,medium:`14px`,large:`16px`})[e],m=e=>`@media (max-width: ${e}px)`,h={phone:m(640),tablet:m(768)},g={phone:640,tablet:768};function _(e){return t=>`${s()} solid ${t.theme.color[e]}`}function v(e){return`${s()} solid ${e}`}function y(e){return`1px solid ${e}`}var b={cssWithAlpha(e,t){if(!e.startsWith(`#`))return e;let n=e.slice(1),r=n.length===3?n.split(``).map(e=>e+e).join(``):n;return r.length===6?`rgba(${Number.parseInt(r.slice(0,2),16)}, ${Number.parseInt(r.slice(2,4),16)}, ${Number.parseInt(r.slice(4,6),16)}, ${Math.min(1,Math.max(0,t))})`:e}};function x(e){return e?`rgba(255, 255, 255, 0.08)`:`rgba(0, 0, 0, 0.04)`}function S(e){return e}var C={isSafari:typeof navigator<`u`&&/^((?!chrome|android).)*safari/i.test(navigator.userAgent),isTouchDevice:typeof window<`u`&&`ontouchstart`in window&&!window.matchMedia(`(hover: hover)`).matches},w=()=>C.isTouchDevice?`active`:`hover`,T=()=>C.isTouchDevice?`active`:`hover`;function E(e){return C.isTouchDevice?e.active:e.hover}var D=(t,n)=>e`
  --fade-size: ${t}px;
  mask-image: linear-gradient(
    to bottom,
    ${n===`top`||n===`both`?`transparent, black var(--fade-size),`:``}
      black,
    ${n===`bottom`||n===`both`?`black calc(100% - var(--fade-size)), transparent`:``}
  );
`,O=t=>e`
  -webkit-app-region: drag;
  & > * {
    -webkit-app-region: no-drag;
  }
`,k=e=>({dark:`0 4px 12px rgba(0,0,0,0.3)`,light:`0 2px 4px rgba(0,0,0,0.1)`})[e]??`none`;export{s as C,S as D,c as E,u as O,v as S,i as T,h as _,n as a,k as b,a as c,x as d,o as f,r as g,E as h,y as i,p as l,T as m,b as n,d as o,w as p,t as r,O as s,C as t,f as u,g as v,l as w,_ as x,D as y};