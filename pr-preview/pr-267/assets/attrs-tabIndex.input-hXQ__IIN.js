import{j as e,c as t}from"./index-Oi5eyQCb.js";import{F as r}from"./flex-BFhmBe3g.js";const l=t(r).attrs(o=>({tabIndex:o.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
  background-color: ${o=>o.$applyBackground?o.theme.color.bgBase:"inherit"};
  scrollbar-gutter: ${o=>o.gutter||"auto"};
  &:focus-visible {
    outline: none;
  }
`,a=t.div.attrs(o=>({tabIndex:o.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  background-color: ${o=>o.$applyBackground?o.theme.color.bgBase:"inherit"};
  scrollbar-gutter: ${o=>o.gutter||"auto"};
  &:focus-visible {
    outline: none;
  }
`,c=()=>e.jsxs("div",{children:[e.jsx(l,{children:"Flex: Tab me!"}),e.jsx(a,{children:"Div: Tab me!"})]});export{c as App,a as ScrollableDiv,l as ScrollableFlex};
