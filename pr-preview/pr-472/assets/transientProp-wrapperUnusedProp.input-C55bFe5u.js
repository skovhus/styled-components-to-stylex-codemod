import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-DGf6c7nm.js";n();var r=e(),i=t.div`
  overflow: auto;
  background-color: ${e=>e.$applyBackground?`white`:`transparent`};
`,a=t(i)`
  overflow: hidden;
  border: ${e=>e.$applyBackground?`1px solid gray`:`none`};
`;function o(){return(0,r.jsxs)(`div`,{style:{display:`flex`,gap:16},children:[(0,r.jsx)(i,{$applyBackground:!0,children:`With Background`}),(0,r.jsx)(i,{children:`Without Background`}),(0,r.jsx)(a,{$applyBackground:!0,children:`Div With BG`}),(0,r.jsx)(a,{children:`Div Without BG`})]})}export{o as App,i as Scrollable,a as ScrollableDiv};