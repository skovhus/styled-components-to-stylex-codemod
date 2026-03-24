import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-DF0gStDF.js";import{S as i}from"./helpers-kbAg6ZEK.js";e(t(),1);var a=n(),o=r.span`
  font-size: 12px;
  color: ${e=>e.theme.isDark?e.theme.color.labelBase:e.theme.color.labelMuted};
  border-color: ${e=>e.theme.isDark?e.theme.color.bgSub:e.theme.color.bgBorderFaint};
`,s=r.div`
  ${e=>e.theme.isDark?``:`padding: ${i()};`}
`,c=r.div`
  --highlighted-color: ${e=>e.theme.isDark?e.theme.color?.bgBorderSolid:e.theme.color?.bgBorderFaint};
  background-color: var(--highlighted-color);
  padding: 16px;
`,l=()=>(0,a.jsxs)(`div`,{children:[(0,a.jsx)(o,{children:`Label`}),(0,a.jsx)(s,{children:`Box`}),(0,a.jsx)(c,{children:`DayPicker`})]});export{l as App};