import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-i2b-6PdY.js";import{D as r,a as i,b as a}from"./helpers-BW8fQP6V.js";t();var o=e(),s=n.span`
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
  color: ${e=>e.theme.isDark?i(`labelMuted`)(e):a()};
  padding: 8px;
`,f=n.div`
  color: ${e=>e.theme.isDark?`red`:`blue`};
  background-color: ${e=>e.theme.isDark?a():i(`labelMuted`)(e)};
  color: green;
  padding: 8px;
`,p=n.div`
  ${e=>e.theme.isDark?``:`padding: ${r()};`}
`,m=n.div`
  --highlighted-color: ${e=>e.theme.isDark?e.theme.color?.bgBorderSolid:e.theme.color?.bgBorderFaint};
  background-color: var(--highlighted-color);
  padding: 16px;
`,h=()=>(0,o.jsxs)(`div`,{children:[(0,o.jsx)(s,{children:`Label`}),(0,o.jsx)(c,{$dark:`bgBorderSolid`,$light:`bgBaseHover`,children:`Helper color box`}),(0,o.jsx)(l,{children:`Helper gradient box`}),(0,o.jsx)(u,{children:`Runtime color box`}),(0,o.jsx)(d,{children:`Negated runtime color box`}),(0,o.jsx)(f,{children:`Cleared theme hook runtime color box`}),(0,o.jsx)(p,{children:`Box`}),(0,o.jsx)(m,{children:`DayPicker`})]});export{h as App};