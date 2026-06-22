import{l as e}from"./index-Cx-FVXAG.js";var t=e`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,n=e=>t=>t.theme.color[e],r=()=>`#2d3748`,i=e=>({accent:`#8B5CF6`,bgBase:`#990000`,bgBaseHover:`#BAE6FD`,bgBorderFaint:`#7DD3FC`,bgBorderSolid:`#94A3B8`,bgFocus:`#60A5FA`,bgSelected:`#3B82F6`,bgSub:`#009900`,controlPrimary:`#3B82F6`,controlPrimaryHover:`#2563EB`,greenBase:`#22C55E`,labelBase:`#111827`,labelFaint:`#9CA3AF`,labelMuted:`#6B7280`,labelTitle:`#111827`,primaryColor:`#BF4F74`,textPrimary:`#111827`,textSecondary:`#6B7280`})[e];function a(e,t){return t===`theme`?t=>t.theme.color[e]:e===`bgSub`?`#009900`:`#990000`}var o=()=>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,s=()=>`
  display: flex;
  align-items: center;
  justify-content: center;
`,c=()=>`
  background-image: linear-gradient(90deg, #ff6b6b, #5f6cff);
  color: transparent;
`,l=e`
  outline: 2px solid #4f46e5;
`,u=()=>`0.5px`,d=e=>`
  display: -webkit-box;
  -webkit-line-clamp: ${e};
  -webkit-box-orient: vertical;
  overflow: hidden;
`,f=e=>`var(--speed-${e})`,p={modal:1e3,popover:900,dialog:800},m={ui:{spacing:{small:`4px`,medium:`8px`,large:`16px`}}},h=e=>({normal:400,medium:500,bold:600})[e],g=e=>({small:`12px`,medium:`14px`,large:`16px`})[e],_=e=>`@media (max-width: ${e}px)`,v={phone:_(640),tablet:_(768)},y={phone:640,tablet:768};function b(e){return t=>`${u()} solid ${t.theme.color[e]}`}function x(e){return`${u()} solid ${e}`}function S(e){return`1px solid ${e}`}var C={cssWithAlpha(e,t){if(!e.startsWith(`#`))return e;let n=e.slice(1),r=n.length===3?n.split(``).map(e=>e+e).join(``):n;return r.length===6?`rgba(${Number.parseInt(r.slice(0,2),16)}, ${Number.parseInt(r.slice(2,4),16)}, ${Number.parseInt(r.slice(4,6),16)}, ${Math.min(1,Math.max(0,t))})`:e}};function w(e){return e?`rgba(255, 255, 255, 0.08)`:`rgba(0, 0, 0, 0.04)`}function T(e){return e}var E={isSafari:typeof navigator<`u`&&/^((?!chrome|android).)*safari/i.test(navigator.userAgent),isTouchDevice:typeof window<`u`&&`ontouchstart`in window&&!window.matchMedia(`(hover: hover)`).matches},D=()=>E.isTouchDevice?`active`:`hover`,O=()=>E.isTouchDevice?`active`:`hover`;function k(e){return E.isTouchDevice?e.active:e.hover}var A=(t,n)=>e`
  --fade-size: ${t}px;
  mask-image: linear-gradient(
    to bottom,
    ${n===`top`||n===`both`?`transparent, black var(--fade-size),`:``}
      black,
    ${n===`bottom`||n===`both`?`black calc(100% - var(--fade-size)), transparent`:``}
  );
`,j=t=>e`
  -webkit-app-region: drag;
  & > * {
    -webkit-app-region: no-drag;
  }
`,M=e=>({dark:`0 4px 12px rgba(0,0,0,0.3)`,light:`0 2px 4px rgba(0,0,0,0.1)`})[e]??`none`,N=e=>e===`dark`?`0 0 16px rgba(0,0,0,0.45)`:`0 0 16px rgba(255,255,255,0.45)`;export{d as A,A as C,u as D,x as E,p as M,f as O,y as S,b as T,k as _,n as a,r as b,s as c,h as d,w as f,O as g,D as h,S as i,T as j,o as k,l,c as m,C as n,m as o,N as p,t as r,j as s,E as t,g as u,a as v,M as w,v as x,i as y};