import{j as r,c as t}from"./index-M0yL6_Af.js";const n=t.div`
  overflow: auto;
  background-color: ${o=>o.$applyBackground?"white":"transparent"};
`,l=t(n)`
  overflow: hidden;
  border: ${o=>o.$applyBackground?"1px solid gray":"none"};
`;function e(){return r.jsxs("div",{style:{display:"flex",gap:16},children:[r.jsx(n,{$applyBackground:!0,children:"With Background"}),r.jsx(n,{children:"Without Background"}),r.jsx(l,{$applyBackground:!0,children:"Div With BG"}),r.jsx(l,{children:"Div Without BG"})]})}export{e as App,n as Scrollable,l as ScrollableDiv};
