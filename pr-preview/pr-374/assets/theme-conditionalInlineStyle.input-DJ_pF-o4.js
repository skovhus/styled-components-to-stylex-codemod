import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-3FcoHYwD.js";e(t(),1);var i=n(),a=r.div`
  padding: 8px 16px;
  background-color: ${e=>e.theme.isDark?e.theme.highlightVariant(e.theme.color.bgFocus):e.theme.color.bgFocus};
`,o=r.div`
  --highlighted-color: ${e=>e.theme.isDark?e.theme.baseTheme?.color.bgBorderSolid:e.theme.color.bgBorderFaint};
  background-color: var(--highlighted-color);
  padding: 16px;
`,s=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,i.jsx)(a,{children:`Default`}),(0,i.jsx)(o,{children:`DayPicker`})]});export{s as App,a as Chip};