import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-BeqDw0W2.js";import{E as r}from"./helpers-DS88G6kc.js";t();var i=e(),a=n.span`
  font-size: 12px;
  color: ${e=>e.theme.isDark?e.theme.color.labelBase:e.theme.color.labelMuted};
  border-color: ${e=>e.theme.isDark?e.theme.color.bgSub:e.theme.color.bgBorderFaint};
`,o=n.div`
  ${e=>e.theme.isDark?``:`padding: ${r()};`}
`,s=n.div`
  --highlighted-color: ${e=>e.theme.isDark?e.theme.color?.bgBorderSolid:e.theme.color?.bgBorderFaint};
  background-color: var(--highlighted-color);
  padding: 16px;
`,c=()=>(0,i.jsxs)(`div`,{children:[(0,i.jsx)(a,{children:`Label`}),(0,i.jsx)(o,{children:`Box`}),(0,i.jsx)(s,{children:`DayPicker`})]});export{c as App};