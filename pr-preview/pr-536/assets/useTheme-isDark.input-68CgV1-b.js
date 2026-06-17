import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-8N9Edbz7.js";import{D as r,a as i,b as a}from"./helpers-Crq9pNrb.js";t();var o=e(),s=n.span`
  font-size: 12px;
  color: ${e=>e.theme.isDark?e.theme.color.labelBase:e.theme.color.labelMuted};
  border-color: ${e=>e.theme.isDark?e.theme.color.bgSub:e.theme.color.bgBorderFaint};
`,c=n.div`
  background: ${e=>e.theme.isDark?i(e.$dark)(e):i(e.$light)(e)};
  color: ${i(`labelBase`)};
  padding: 12px;
`,l=n.div`
  background: ${e=>e.theme.isDark?`linear-gradient(to bottom, ${i(`bgSub`)(e)} 0%, transparent 100%)`:`linear-gradient(to bottom, transparent 0%, ${i(`bgBaseHover`)(e)} 100%)`};
  color: ${i(`labelBase`)};
  padding: 12px;
`,u=n.div`
  color: ${e=>e.theme.isDark?a():e.theme.color.labelMuted};
  padding: 8px;
`,d=n.div`
  ${e=>e.theme.isDark?``:`padding: ${r()};`}
`,f=n.div`
  --highlighted-color: ${e=>e.theme.isDark?e.theme.color?.bgBorderSolid:e.theme.color?.bgBorderFaint};
  background-color: var(--highlighted-color);
  padding: 16px;
`,p=()=>(0,o.jsxs)(`div`,{children:[(0,o.jsx)(s,{children:`Label`}),(0,o.jsx)(c,{$dark:`bgBorderSolid`,$light:`bgBaseHover`,children:`Helper color box`}),(0,o.jsx)(l,{children:`Helper gradient box`}),(0,o.jsx)(u,{children:`Runtime color box`}),(0,o.jsx)(d,{children:`Box`}),(0,o.jsx)(f,{children:`DayPicker`})]});export{p as App};