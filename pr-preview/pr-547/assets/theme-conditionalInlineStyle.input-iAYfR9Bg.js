import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-B2DAr4lm.js";t();var r=e(),i=n.div`
  padding: 8px 16px;
  background-color: ${e=>e.theme.isDark?e.theme.highlightVariant(e.theme.color.bgFocus):e.theme.color.bgFocus};
`,a=n.div`
  --highlighted-color: ${e=>e.theme.isDark?e.theme.baseTheme?.color.bgBorderSolid:e.theme.color.bgBorderFaint};
  background-color: var(--highlighted-color);
  padding: 16px;
`,o=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,r.jsx)(i,{children:`Default`}),(0,r.jsx)(a,{children:`DayPicker`})]});export{o as App,i as Chip};