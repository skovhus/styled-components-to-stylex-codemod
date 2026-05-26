import{d as e}from"./index-CZjB1IGa.js";var t=e`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,n=e=>t=>t.theme.color[e],r=e=>({accent:`#8B5CF6`,bgBase:`#990000`,bgBaseHover:`#BAE6FD`,bgBorderFaint:`#7DD3FC`,bgBorderSolid:`#94A3B8`,bgFocus:`#60A5FA`,bgSelected:`#3B82F6`,bgSub:`#009900`,controlPrimary:`#3B82F6`,controlPrimaryHover:`#2563EB`,greenBase:`#22C55E`,labelBase:`#111827`,labelFaint:`#9CA3AF`,labelMuted:`#6B7280`,labelTitle:`#111827`,primaryColor:`#BF4F74`,textPrimary:`#111827`,textSecondary:`#6B7280`})[e];function i(e,t){return t===`theme`?t=>t.theme.color[e]:e===`bgSub`?`#009900`:`#990000`}var a=()=>`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`,o=()=>`
  display: flex;
  align-items: center;
  justify-content: center;
`,s=()=>`
  background-image: linear-gradient(90deg, #ff6b6b, #5f6cff);
  color: transparent;
`,c=e`
  outline: 2px solid #4f46e5;
`,l=()=>`0.5px`,u=e=>`
  display: -webkit-box;
  -webkit-line-clamp: ${e};
  -webkit-box-orient: vertical;
  overflow: hidden;
`,d=e=>`var(--speed-${e})`,f={modal:1e3,popover:900,dialog:800},p={ui:{spacing:{small:`4px`,medium:`8px`,large:`16px`}}},m=e=>({normal:400,medium:500,bold:600})[e],h=e=>({small:`12px`,medium:`14px`,large:`16px`})[e],g=e=>`@media (max-width: ${e}px)`,_={phone:g(640),tablet:g(768)},v={phone:640,tablet:768};function y(e){return t=>`${l()} solid ${t.theme.color[e]}`}function b(e){return`${l()} solid ${e}`}function x(e){return`1px solid ${e}`}var S={cssWithAlpha(e,t){if(!e.startsWith(`#`))return e;let n=e.slice(1),r=n.length===3?n.split(``).map(e=>e+e).join(``):n;return r.length===6?`rgba(${Number.parseInt(r.slice(0,2),16)}, ${Number.parseInt(r.slice(2,4),16)}, ${Number.parseInt(r.slice(4,6),16)}, ${Math.min(1,Math.max(0,t))})`:e}};function C(e){return e?`rgba(255, 255, 255, 0.08)`:`rgba(0, 0, 0, 0.04)`}function w(e){return e}var T={isSafari:typeof navigator<`u`&&/^((?!chrome|android).)*safari/i.test(navigator.userAgent),isTouchDevice:typeof window<`u`&&`ontouchstart`in window&&!window.matchMedia(`(hover: hover)`).matches},E=()=>T.isTouchDevice?`active`:`hover`,D=()=>T.isTouchDevice?`active`:`hover`;function O(e){return T.isTouchDevice?e.active:e.hover}var k=(t,n)=>e`
  --fade-size: ${t}px;
  mask-image: linear-gradient(
    to bottom,
    ${n===`top`||n===`both`?`transparent, black var(--fade-size),`:``}
      black,
    ${n===`bottom`||n===`both`?`black calc(100% - var(--fade-size)), transparent`:``}
  );
`,A=t=>e`
  -webkit-app-region: drag;
  & > * {
    -webkit-app-region: no-drag;
  }
`,j=e=>({dark:`0 4px 12px rgba(0,0,0,0.3)`,light:`0 2px 4px rgba(0,0,0,0.1)`})[e]??`none`,M=e=>e===`dark`?`0 0 16px rgba(0,0,0,0.45)`:`0 0 16px rgba(255,255,255,0.45)`;export{w as A,j as C,d as D,l as E,a as O,k as S,b as T,O as _,n as a,_ as b,o as c,m as d,C as f,D as g,E as h,x as i,f as j,u as k,c as l,s as m,S as n,p as o,M as p,t as r,A as s,T as t,h as u,i as v,y as w,v as x,r as y};