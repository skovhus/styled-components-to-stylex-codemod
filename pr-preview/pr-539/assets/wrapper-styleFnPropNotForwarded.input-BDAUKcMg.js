import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{u as t}from"./index-BtQohzcq.js";import{t as n}from"./flex-BAdoxGXl.js";var r=e(),i=t(n)`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
  background-color: ${e=>e.$applyBackground?`gray`:`inherit`};
  scrollbar-gutter: ${e=>e.gutter||`auto`};
`,a=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,r.jsx)(i,{gutter:`stable`,$applyBackground:!0,gap:8,children:(0,r.jsx)(`div`,{children:`Stable gutter with background`})}),(0,r.jsx)(i,{gutter:`auto`,gap:4,children:(0,r.jsx)(`div`,{children:`Auto gutter, no background`})}),(0,r.jsx)(i,{gap:12,children:(0,r.jsx)(`div`,{children:`Default (no gutter, no background)`})})]});export{a as App,i as Scrollable};