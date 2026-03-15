import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-CvfJmPeC.js";import{t as n}from"./flex-D9zwId_E.js";var r=e(),i=t(n).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
  background-color: ${e=>e.$applyBackground?e.theme.color.bgBase:`inherit`};
  scrollbar-gutter: ${e=>e.gutter||`auto`};
  &:focus-visible {
    outline: none;
  }
`,a=t.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  background-color: ${e=>e.$applyBackground?e.theme.color.bgBase:`inherit`};
  scrollbar-gutter: ${e=>e.gutter||`auto`};
  &:focus-visible {
    outline: none;
  }
`,o=t.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
  background-color: ${e=>e.$applyBackground?e.theme.color.bgBase:`inherit`};
  outline: ${e=>e.tabIndex===0?`none`:`auto`};
`,s=()=>(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`8px`,height:`200px`},children:[(0,r.jsx)(i,{gutter:`stable`,$applyBackground:!0,children:(0,r.jsx)(`div`,{style:{height:`400px`,padding:`8px`},children:`Flex: Tab me! (scrollable with stable gutter)`})}),(0,r.jsx)(a,{gutter:`stable`,children:(0,r.jsx)(`div`,{style:{height:`400px`,padding:`8px`},children:`Div: Tab me! (scrollable with stable gutter)`})}),(0,r.jsx)(o,{children:`Tab index in style`})]});export{s as App,a as ScrollableDiv,i as ScrollableFlex,o as TabIndexInStyle};