import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-BEHMEpNn.js";import{n,u as r}from"./helpers-0uNrjOm7.js";var i=e(),a=t.label`
  background-color: ${e=>e.checked?n.cssWithAlpha(e.theme.color.bgSelected,.8):`transparent`};
  padding: 8px 12px;
`,o=t.div`
  background-color: ${e=>e.$isHighlighted?r(e.theme.isDark):`transparent`};
  padding: 8px 16px;
`,s=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,i.jsx)(a,{checked:!0,children:`Checked Card`}),(0,i.jsx)(a,{checked:!1,children:`Unchecked Card`}),(0,i.jsx)(o,{$isHighlighted:!0,children:`Highlighted Row`}),(0,i.jsx)(o,{$isHighlighted:!1,children:`Normal Row`})]});export{s as App};