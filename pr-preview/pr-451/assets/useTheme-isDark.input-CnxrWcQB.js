import"./chunk-jRWAZmH_.js";import{c as e,m as t,p as n}from"./index-9A_WyPJK.js";import{w as r}from"./helpers-CP6_sm1D.js";t();var i=n(),a=e.span`
  font-size: 12px;
  color: ${e=>e.theme.isDark?e.theme.color.labelBase:e.theme.color.labelMuted};
  border-color: ${e=>e.theme.isDark?e.theme.color.bgSub:e.theme.color.bgBorderFaint};
`,o=e.div`
  ${e=>e.theme.isDark?``:`padding: ${r()};`}
`,s=e.div`
  --highlighted-color: ${e=>e.theme.isDark?e.theme.color?.bgBorderSolid:e.theme.color?.bgBorderFaint};
  background-color: var(--highlighted-color);
  padding: 16px;
`,c=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{children:`Label`}),(0,i.jsx)(o,{children:`Box`}),(0,i.jsx)(s,{children:`DayPicker`})]});export{c as App};