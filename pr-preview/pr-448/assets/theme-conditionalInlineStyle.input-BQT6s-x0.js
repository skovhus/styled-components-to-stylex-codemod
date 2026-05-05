import"./chunk-jRWAZmH_.js";import{c as e,m as t,p as n}from"./index-Btu-jASD.js";t();var r=n(),i=e.div`
  padding: 8px 16px;
  background-color: ${e=>e.theme.isDark?e.theme.highlightVariant(e.theme.color.bgFocus):e.theme.color.bgFocus};
`,a=e.div`
  --highlighted-color: ${e=>e.theme.isDark?e.theme.baseTheme?.color.bgBorderSolid:e.theme.color.bgBorderFaint};
  background-color: var(--highlighted-color);
  padding: 16px;
`,o=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,r.jsx)(i,{children:`Default`}),(0,r.jsx)(a,{children:`DayPicker`})]});export{o as App,i as Chip};