import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-BRshMvts.js";import{E as r}from"./helpers-B-_tABUP.js";n();var i=e(),a=t.span`
  font-size: 12px;
  color: ${e=>e.theme.isDark?e.theme.color.labelBase:e.theme.color.labelMuted};
  border-color: ${e=>e.theme.isDark?e.theme.color.bgSub:e.theme.color.bgBorderFaint};
`,o=t.div`
  ${e=>e.theme.isDark?``:`padding: ${r()};`}
`,s=t.div`
  --highlighted-color: ${e=>e.theme.isDark?e.theme.color?.bgBorderSolid:e.theme.color?.bgBorderFaint};
  background-color: var(--highlighted-color);
  padding: 16px;
`,c=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{children:`Label`}),(0,i.jsx)(o,{children:`Box`}),(0,i.jsx)(s,{children:`DayPicker`})]});export{c as App};