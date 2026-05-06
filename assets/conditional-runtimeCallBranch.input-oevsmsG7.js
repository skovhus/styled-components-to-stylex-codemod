import{c as e,p as t}from"./index-DDr0B6mK.js";import{d as n,n as r}from"./helpers-CS4F7Gqp.js";var i=t(),a=e.label`
  background-color: ${e=>e.checked?r.cssWithAlpha(e.theme.color.bgSelected,.8):`transparent`};
  padding: 8px 12px;
`,o=e.div`
  background-color: ${e=>e.$isHighlighted?n(e.theme.isDark):`transparent`};
  padding: 8px 16px;
`,s=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,i.jsx)(a,{checked:!0,children:`Checked Card`}),(0,i.jsx)(a,{checked:!1,children:`Unchecked Card`}),(0,i.jsx)(o,{$isHighlighted:!0,children:`Highlighted Row`}),(0,i.jsx)(o,{$isHighlighted:!1,children:`Normal Row`})]});export{s as App};