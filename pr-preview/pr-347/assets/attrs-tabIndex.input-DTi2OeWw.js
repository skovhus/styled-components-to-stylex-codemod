import{j as t,c as o}from"./index-Dr1KaoBT.js";import{F as l}from"./flex-CcfuFjAs.js";const a=o(l).attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
  background-color: ${e=>e.$applyBackground?e.theme.color.bgBase:"inherit"};
  scrollbar-gutter: ${e=>e.gutter||"auto"};
  &:focus-visible {
    outline: none;
  }
`,r=o.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  background-color: ${e=>e.$applyBackground?e.theme.color.bgBase:"inherit"};
  scrollbar-gutter: ${e=>e.gutter||"auto"};
  &:focus-visible {
    outline: none;
  }
`,i=o.div.attrs(e=>({tabIndex:e.tabIndex??0}))`
  overflow-y: auto;
  position: relative;
  flex-grow: 1;
  background-color: ${e=>e.$applyBackground?e.theme.color.bgBase:"inherit"};
  outline: ${e=>e.tabIndex===0?"none":"auto"};
`,c=()=>t.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"8px",height:"200px"},children:[t.jsx(a,{gutter:"stable",$applyBackground:!0,children:t.jsx("div",{style:{height:"400px",padding:"8px"},children:"Flex: Tab me! (scrollable with stable gutter)"})}),t.jsx(r,{gutter:"stable",children:t.jsx("div",{style:{height:"400px",padding:"8px"},children:"Div: Tab me! (scrollable with stable gutter)"})}),t.jsx(i,{children:"Tab index in style"})]});export{c as App,r as ScrollableDiv,a as ScrollableFlex,i as TabIndexInStyle};
