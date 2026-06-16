import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-DnaHas9W.js";import{E as r,a as i}from"./helpers-AI94Lb71.js";t();var a=e(),o=n.span`
  font-size: 12px;
  color: ${e=>e.theme.isDark?e.theme.color.labelBase:e.theme.color.labelMuted};
  border-color: ${e=>e.theme.isDark?e.theme.color.bgSub:e.theme.color.bgBorderFaint};
`,s=n.div`
  background: ${e=>e.theme.isDark?i(`bgBorderSolid`)(e):i(`bgBaseHover`)(e)};
  color: ${i(`labelBase`)};
  padding: 12px;
`,c=n.div`
  ${e=>e.theme.isDark?``:`padding: ${r()};`}
`,l=n.div`
  --highlighted-color: ${e=>e.theme.isDark?e.theme.color?.bgBorderSolid:e.theme.color?.bgBorderFaint};
  background-color: var(--highlighted-color);
  padding: 16px;
`,u=()=>(0,a.jsxs)(`div`,{children:[(0,a.jsx)(o,{children:`Label`}),(0,a.jsx)(s,{children:`Helper color box`}),(0,a.jsx)(c,{children:`Box`}),(0,a.jsx)(l,{children:`DayPicker`})]});export{u as App};